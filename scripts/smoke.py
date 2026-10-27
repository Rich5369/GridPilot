"""Run from any directory with both local dev servers already started."""
import json
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import OptimizationResult

import httpx

ROOT = Path(__file__).resolve().parents[1]
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=10) as client:
    response = client.get('/api/health', headers={'Origin': 'http://localhost:5173'})
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'project': 'GridPilot'}
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert client.get('/docs').status_code == 200
    response = client.post('/api/optimize', json=json.loads(
        (ROOT / 'sample_data/scenario.demo.json').read_text()))
    assert response.status_code == 200
    result = OptimizationResult.model_validate(response.json())
    assert result.feasibility_status == 'feasible'
    scenario = json.loads((ROOT / 'sample_data/scenario.demo.json').read_text())
    scenario['fixed_demand_kw'] = [101] * 24
    response = client.post('/api/optimize', json=scenario)
    assert response.status_code == 200
    result = OptimizationResult.model_validate(response.json())
    assert result.feasibility_status == 'infeasible'
    assert result.optimized_demand_kw is None
    assert client.post('/api/optimize', json={}).status_code == 422
    response = client.options('/api/optimize', headers={
        'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
response = httpx.get('http://127.0.0.1:5173', timeout=10)
assert response.status_code == 200
assert 'GridPilot | Energy overview' in response.text
print('PASS: live health, CORS, docs, real feasible/infeasible optimization, validation, and Vite HTTP serving')
