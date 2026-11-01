"""Injected completions test presentation policy; real optimizer checks grounding."""
import json
from copy import deepcopy

import pytest

from backend.tests.test_advisor import provider, client, SAMPLE, ask


@pytest.mark.parametrize('question', [
    'How can I save more money?', 'What should I try next?',
    'How can I reduce costs without disrupting work?',
])
def test_short_advice_and_optional_summary(provider, question):
    provider[1](answer='Try running equipment when electricity is cheaper and avoid using large devices at the same time.',
                summary_bullets=['Run equipment when electricity is cheaper.'], fact_keys=['prices', 'constraints'])
    response = client.post('/api/ai/conversation', json={'request': question, 'scenario': SAMPLE})
    assert response.status_code == 200
    body = response.json()
    assert len((body['message'] + ' ' + ' '.join(body['summary_bullets'])).split()) <= 60
    assert body['follow_up_questions'] == []
    assert 'Submitted hourly electricity prices' in body['facts'][0]
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['verified_facts']['constraints']
    assert payload['detailed_response'] is False
    instructions = provider[0].call_args.kwargs['messages'][0]['content']
    assert 'around four short sentences' in instructions
    assert 'two brief paragraphs' in instructions
    assert 'Simple questions can have shorter answers' in instructions
    assert 'at most ONE' in instructions
    assert 'at most two actionable suggestions' in instructions


def test_rejects_long_ordinary_reply_without_truncating(provider):
    provider[1](answer='Equipment may run when electricity is cheaper. ' * 20)
    assert ask().status_code == 502


@pytest.mark.parametrize('question', ['Explain the scheduling method in technical detail.', 'Tell me more.'])
def test_explicit_details_allow_longer_grounded_explanations(provider, question):
    explanation = 'Equipment may run when electricity is cheaper. ' * 13
    provider[1](answer=explanation)
    response = client.post('/api/ai/conversation', json={
        'request': question, 'scenario': SAMPLE})
    assert response.status_code == 200
    assert response.json()['message'].split() == explanation.split()
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['detailed_response'] is True


@pytest.mark.parametrize('fields', [
    {'follow_up_questions': ['When can charging move?', 'What is your tariff?']},
    {'answer': 'When can charging move?', 'follow_up_questions': ['What is your tariff?']},
    {'summary_bullets': ['You will save USD 999.']},
    {'summary_bullets': ['Move equipment use.'] * 3},
    {'answer': 'Configuration: {"charger": "fast"}.'},
])
def test_no_multiple_questions_raw_data_or_unsafe_summary(provider, fields):
    provider[1](**fields)
    assert ask().status_code == 502


def test_missing_result_disclosure_is_visible_without_facts(provider):
    provider[1](answer='A different schedule may help.', fact_keys=['cost'])
    body = ask().json()
    assert 'not been verified' in ' '.join(body['warnings'])
    assert body['proposed_scenario'] is None


def test_infeasibility_visible_even_if_model_omits_warning(provider):
    scenario = deepcopy(SAMPLE)
    scenario['building_max_demand_kw'] = 0.1
    result = client.post('/api/optimize', json=scenario).json()
    provider[1](answer='Review your equipment needs.', fact_keys=[])
    response = client.post('/api/ai/conversation', json={
        'request': 'What should I do next?', 'scenario': scenario, 'result_id': result['result_id']})
    assert response.status_code == 200
    notices = ' '.join(response.json()['warnings'])
    assert 'cannot meet' in notices
    assert 'power limit' in notices
    assert 'Savings are not confirmed' in notices


def test_result_explanation_is_short_and_never_resolves(provider, monkeypatch):
    result = client.post('/api/optimize', json=SAMPLE).json()
    monkeypatch.setattr('backend.api.routes.optimize_scenario', lambda *a, **k: pytest.fail('Unexpected solve'))
    provider[1](answer='Charging may have helped.', fact_keys=[])
    body = client.post('/api/ai/conversation', json={
        'request': 'Explain this optimization result.', 'scenario': SAMPLE, 'result_id': result['result_id']}).json()
    assert len(body['message'].split()) <= 60
    assert 'full electricity bill' in body['message']
    assert f"${result['baseline_electricity_cost_usd']:.2f}" in body['message']
    assert f"${result['optimized_electricity_cost_usd']:.2f}" in body['message']
    assert 'scenario evidence' not in body['message']
    assert any('Verified submitted' in fact for fact in body['facts'])


def test_solver_validity_warning_survives_in_plain_language():
    from types import SimpleNamespace
    from backend.ai.advisor_presentation import result_notices
    result = SimpleNamespace(feasibility_status='feasible', operating_plan=SimpleNamespace(
        warnings=['Primary solution is feasible without optimality proof; peak tie-break not run.']))
    assert result_notices(result, []) == [
        'The plan can work, but the lowest possible cost and peak power use have not been confirmed.']


def test_four_sentences_become_two_paragraphs_with_concise_takeaways(provider):
    sentences = [
        'Your current schedule may leave little room for further savings.',
        'Running flexible equipment when electricity is cheaper may help.',
        'Avoid running large devices at the same time where operations allow.',
        'Run optimization to check whether a different schedule could lower costs.',
    ]
    provider[1](answer=' '.join(sentences), summary_bullets=[
        'Use cheaper electricity periods where possible.', 'Check a different schedule with optimization.'])
    body = ask().json()
    assert body['message'].split('\n\n') == [' '.join(sentences[:2]), ' '.join(sentences[2:])]
    assert len(body['summary_bullets']) == 2
    assert body['next_step'] is None


def test_simple_answer_does_not_require_padding_or_bullets(provider):
    provider[1](answer='Run optimization to check your schedule.', summary_bullets=[])
    body = ask().json()
    assert body['message'] == 'Run optimization to check your schedule.'
    assert body['summary_bullets'] == []


def test_paragraph_formatting_preserves_verified_decimal_amounts():
    from backend.ai.advisor_presentation import format_answer
    assert format_answer('Daily cost is $12.34. The comparison covers energy. Bills can include other charges. Ask for details.') == (
        'Daily cost is $12.34. The comparison covers energy.\n\nBills can include other charges. Ask for details.')
