# Foundation verification

Verified on 2026-10-26 in the Linux workspace. Git repository and origin were
already configured; no second repository, commits, pushes or deployments created.

- Node 24.21.0, npm 11.19.0, Python 3.14.2, Git 2.55.0 available.
- Frontend dependencies installed; npm audit reported zero vulnerabilities.
- Backend dependencies installed in `backend/.venv`; resolved snapshot saved.
- `npm --prefix frontend run build`: passed (TypeScript + Vite production build).
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend test`: 4 passed; opt-in live test skipped as intended.
- `python -m pytest backend/tests -q`: 20 passed.
- Real Uvicorn startup, Vite serving and `scripts/smoke.py`: passed.
- `GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration`: 1 passed.
- Git whitespace review passed. Environments, node_modules, local secrets and
  build output are ignored; safe `.env.example` files remain visible to Git.

Network downloads and localhost tests required execution outside this workspace's
restricted sandbox. Backend tests emit one upstream Starlette warning that its
httpx TestClient adapter is deprecated; tests pass with the pinned dependencies.
The real HTTP smoke check also passes independently of that adapter.

Not verified: actual Windows execution or visual rendering in a real browser
(no installed browser/preview tool). React DOM tests verify the status component's
connection, failure, retry and timeout behavior; they do not assess visual layout.
Use README instructions for Windows setup and desktop/mobile browser review.
