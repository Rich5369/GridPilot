"""Fresh-process regression: disabled diagnostics must not load the provider SDK."""
import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest


@pytest.mark.parametrize('flag', [None, '0', 'true', 'yes'])
def test_disabled_diagnostic_does_not_import_optional_provider_path(flag):
    env = dict(os.environ, MODEL_API_MODE='mock')
    env.pop('MODEL_API_KEY', None)
    env.pop('MODEL_API_DIAGNOSTIC_ON_STARTUP', None)
    if flag is not None:
        env['MODEL_API_DIAGNOSTIC_ON_STARTUP'] = flag
    child = subprocess.run(
        [sys.executable, '-c', textwrap.dedent('''
            import asyncio
            import importlib.abc
            import json
            from pathlib import Path
            import sys
            import httpx

            class RejectDiagnosticImports(importlib.abc.MetaPathFinder):
                def find_spec(self, fullname, path=None, target=None):
                    if fullname in ('openai', 'backend.ai.startup_diagnostic'):
                        raise AssertionError('Disabled diagnostic attempted import: ' + fullname)

            sys.meta_path.insert(0, RejectDiagnosticImports())
            from backend.main import app

            async def verify():
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://offline.test') as c:
                        response = await c.get('/api/health')
                        assert response.status_code == 200
                        assert response.json() == {'status': 'ok', 'project': 'GridPilot'}
                        fixture = json.loads(Path('sample_data/scenario.demo.json').read_text())
                        response = await c.post('/api/optimize', json=fixture)
                        assert response.status_code == 200
                        assert response.json()['feasibility_status'] == 'feasible'
                        assert abs(response.json()['optimized_electricity_cost_usd'] - 80.64) < 1e-6
                assert 'openai' not in sys.modules
                assert 'backend.ai.startup_diagnostic' not in sys.modules

            asyncio.run(verify())
        ''')],
        cwd=Path(__file__).resolve().parents[2], env=env,
        capture_output=True, text=True, timeout=15,
    )
    assert child.returncode == 0, child.stderr
