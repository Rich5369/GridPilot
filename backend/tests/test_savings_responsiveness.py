"""Concurrent HTTP requests must progress during one offline provider wait."""
import asyncio
from threading import Event

import httpx
import pytest
from fastapi import HTTPException

from backend.ai import savings
from backend.main import app
from backend.savings.service import build_recommendations
from backend.tests.test_savings import BASE, Saved, TODAY


@pytest.mark.parametrize('provider_timeout', [False, True])
def test_slow_selection_does_not_block_concurrent_http(monkeypatch, provider_timeout):
    entered, release = Event(), Event()
    calls = []

    def slow_provider(schema, instructions, payload, **kwargs):
        calls.append((schema, kwargs))
        entered.set()
        # Bounded even if the regression blocks the event loop before release.
        if not release.wait(2):
            raise HTTPException(504, 'offline provider wait exceeded')
        if provider_timeout:
            raise HTTPException(504, 'offline timeout diagnostic')
        return schema(categories=['led', 'scheduling', 'motor']), 'meta'

    async def fixed(request, retail):
        return await build_recommendations(request, retail, TODAY)

    monkeypatch.setattr(savings, 'service', Saved())
    monkeypatch.setattr(savings, 'build_recommendations', fixed)
    monkeypatch.setattr(savings, 'generate', slow_provider)

    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url='http://offline.test') as client:
            pending = asyncio.create_task(client.post('/api/ai/savings/conversation', json={
                'request': 'Fictional warehouse, no EVs or flexible equipment',
                'evidence': {'measures': [BASE]},
                'category_applicability': {'scheduling': False}}))
            try:
                async def wait_for_provider():
                    while not entered.is_set():
                        await asyncio.sleep(.001)
                await asyncio.wait_for(wait_for_provider(), 1)
                health = await asyncio.wait_for(client.get('/api/health'), .5)
                calculated = await asyncio.wait_for(client.post('/api/savings/recommendations',
                    json={'measures': [BASE]}), .5)
                assert health.status_code == calculated.status_code == 200
                assert not pending.done(), 'Other requests must finish before provider release'
            finally:
                release.set()
                response = await pending
            assert response.status_code == 200
            result = response.json()
            assert result['source'] == ('deterministic_fallback' if provider_timeout else 'meta')
            assert 'scheduling' not in result['selected_categories']
            led = next(r for r in result['savings']['recommendations'] if r['id'] == BASE['id'])
            deterministic = next(r for r in calculated.json()['recommendations'] if r['id'] == BASE['id'])
            assert led == deterministic
            assert led['annual_kwh_saved'] == 12500
            assert led['annual_net_savings_usd'] == 2500
            if provider_timeout:
                assert result['message'].startswith('Meta unavailable; using deterministic guidance.')
                assert 'offline timeout diagnostic' not in response.text
            else:
                assert any('first confirm equipment applicability' in q for q in result['follow_up_questions'])
            assert calls == [(savings.CategorySelection, {'reasoning_effort': 'low'})]

    asyncio.run(check())
