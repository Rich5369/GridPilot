import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from backend.eia.retail import RetailPrices, RetailService, STATES, TTL_SECONDS, parse_report

NOW = datetime(2026, 10, 30, 20, 0, tzinfo=timezone.utc)
SNAPSHOT = Path(__file__).parents[1] / 'eia' / 'commercial_snapshot.json'


def report(value='12.50', units='Cents per Kilowatthour', sector='Commercial', timestamp='October 23, 2026'):
    return f'''Release Date: {timestamp}<p>Table 5.6.A. {units}</p>
    <table summary="Procedure Report: test"><tr><th></th><th colspan="2">Residential</th><th colspan="2">{sector}</th></tr>
    <tr><th>State</th><th>August 2026</th><th>August 2025</th><th>August 2026</th><th>August 2025</th></tr>
    <tr><td>California</td><td>99</td><td>98</td><td>{value}</td><td>10.00</td></tr></table>'''


def test_commercial_columns_units_month_and_missing_states():
    r = parse_report(report(), NOW)
    assert r.period == '2026-08' and r.previous_year_period == '2025-08'
    assert r.released_at.isoformat() == '2026-10-23'
    assert r.units == 'cents/kWh' and len(r.states) == 51
    assert next(s for s in r.states if s.state == 'California').cents_per_kwh == 12.5
    assert next(s for s in r.states if s.state == 'Texas').cents_per_kwh is None


@pytest.mark.parametrize('value', ['NM', '--', 'NaN', '-3', 'Infinity'])
def test_missing_or_invalid_not_invented(value):
    with pytest.raises(ValueError):
        parse_report(report(value), NOW)


@pytest.mark.parametrize('kwargs', [{'units': '$/MWh'}, {'sector': 'Industrial'}, {'timestamp': 'October 23, 2027'}])
def test_reject_layout_units_and_future_release(kwargs):
    with pytest.raises((ValueError, TypeError)):
        parse_report(report(**kwargs), NOW)


def test_bundled_snapshot_is_eia_only_complete_and_dated():
    r = RetailPrices.model_validate_json(SNAPSHOT.read_text())
    assert {s.state for s in r.states} == set(STATES)
    assert all(s.cents_per_kwh is not None for s in r.states)
    assert 'eia.gov' in r.source_url and r.period == '2026-08'
    assert r.source_checked_at.tzinfo is not None


def test_cache_coalescing_expiration_failure_saved_and_delayed(monkeypatch):
    elapsed, now, fail, calls = [0], [NOW], [False], []
    service = RetailService(clock=lambda: now[0], monotonic=lambda: elapsed[0])
    async def fetch():
        calls.append(1)
        await asyncio.sleep(0)
        if fail[0]:
            raise httpx.ConnectError('unavailable')
        return parse_report(report(), now[0])
    monkeypatch.setattr(service, 'fetch', fetch)
    async def run():
        results = await asyncio.gather(*(service.get() for _ in range(5)))
        assert len(calls) == 1 and all(r.status == 'available' for r in results)
        original = results[0].source_checked_at
        fail[0], elapsed[0] = True, TTL_SECONDS + 1
        r = await service.get()
        assert len(calls) == 2 and r.status == 'saved' and r.source_checked_at == original
        await service.get()
        assert len(calls) == 2
        now[0] += timedelta(days=90)
        assert (await service.get()).status == 'delayed'
        cold = RetailService(clock=lambda: NOW)
        monkeypatch.setattr(cold, 'fetch', fetch)
        r = await cold.get()
        assert r.status == 'saved' and r.period == '2026-08'
    asyncio.run(run())


def test_regressed_source_does_not_replace_saved_release(monkeypatch):
    service = RetailService(clock=lambda: NOW)
    async def fetch():
        return parse_report(report().replace('August 2026', 'July 2026').replace('August 2025', 'July 2025').replace('October 23, 2026', 'September 23, 2026'), NOW)
    monkeypatch.setattr(service, 'fetch', fetch)
    r = asyncio.run(service.get())
    assert r.status == 'saved' and r.period == '2026-08'


def test_streaming_deadline_and_oversize_use_saved_snapshot(monkeypatch):
    from backend.eia import retail
    real_client = httpx.AsyncClient
    async def run():
        async def slow(request):
            await asyncio.sleep(1)
            return httpx.Response(200, text=report())
        monkeypatch.setattr(retail, 'FETCH_DEADLINE_SECONDS', 0.02)
        monkeypatch.setattr(retail.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(slow)))
        assert (await asyncio.wait_for(RetailService(clock=lambda: NOW).get(), timeout=0.5)).status == 'saved'
        monkeypatch.setattr(retail.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b'x' * 1_000_001))))
        assert (await RetailService(clock=lambda: NOW).get()).status == 'saved'
    asyncio.run(run())
