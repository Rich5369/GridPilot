"""Keep the owned local servers alive for the whole browser run, then stop them."""
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
processes = []
logs = []
try:
    for name, command, environment in [
        ('backend', [str(ROOT / 'backend/.venv/bin/python'), str(OUT / 'qa_backend.py')], os.environ.copy()),
        ('frontend', ['npm', '--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5411'],
         {**os.environ, 'VITE_API_BASE_URL': 'http://127.0.0.1:8411'}),
    ]:
        log = (OUT / f'{name}-server.log').open('w')
        logs.append(log)
        processes.append(subprocess.Popen(command, cwd=ROOT, env=environment,
                                          stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    deadline = time.monotonic() + 30
    for url in ['http://127.0.0.1:8411/__qa__/provider-calls', 'http://127.0.0.1:5411/']:
        while True:
            if any(p.poll() is not None for p in processes):
                raise RuntimeError('An owned QA server exited during startup; inspect server logs.')
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    assert response.status == 200
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Local QA server startup deadline exceeded')
                time.sleep(0.25)
    subprocess.run(['node', str(OUT / 'browser.cjs')], cwd=ROOT, check=True)
finally:
    for process in processes:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
    for log in logs:
        log.close()
