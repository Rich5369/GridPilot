"""Exact employee evidence must preserve uncertainty; no live inference."""
import pytest
from backend.tests.test_advisor import provider, client, SAMPLE


@pytest.mark.parametrize('text,quote,count', [
    ('Approximately 30 employees.', '30 employees', 30),
    ('We have about 30 employees.', '30', 30),
    ('We have 30–50 employees.', '30', 30),
    ('We have 30-50 employees.', '50 employees', 50),
    ('We have between 30 and 50 employees.', '30', 30),
    ('We do not have 30 employees.', '30 employees', 30),
    ('Employee count is unknown; 30 employees was a guess.', '30 employees', 30),
    ('We have 30 employees. Another record says 50 employees.', '30 employees', 30),
    ('We have 30 forklifts. Employee count is unknown.', '30', 30),
])
def test_uncertain_or_conflicting_count_cannot_become_exact(provider, text, quote, count):
    provider[1](profile={'employee_count': count}, profile_evidence={'employee_count': quote})
    response = client.post('/api/ai/conversation', json={'request': text, 'scenario': SAMPLE})
    assert response.status_code == 502
    assert response.json()['detail']['code'] == 'ai_invalid_response'
    assert provider[0].call_count == 1


@pytest.mark.parametrize('text,count', [
    ('We have 30 employees.', 30), ('We have 300 employees.', 300),
    ('We employ 30.', 30), ('staff: 30', 30), ('We have 0 employees.', 0),
])
def test_exact_count_with_short_evidence_still_accepted(provider, text, count):
    provider[1](profile={'employee_count': count}, profile_evidence={'employee_count': str(count)})
    response = client.post('/api/ai/conversation', json={'request': text, 'scenario': SAMPLE})
    assert response.status_code == 200
    assert response.json()['profile']['employee_count'] == count


def test_unknown_count_stays_unknown(provider):
    provider[1](profile={}, profile_evidence={})
    response = client.post('/api/ai/conversation', json={'request': 'Employee count is unknown.', 'scenario': SAMPLE})
    assert response.status_code == 200
    assert response.json()['profile']['employee_count'] is None
