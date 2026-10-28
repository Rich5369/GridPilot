# Temporary Meta model access diagnostic

The backend can list the models visible to its deployed Meta credentials without
Render Shell access. No diagnostic HTTP route is registered.

After this PR is approved, merged, and deployed:

1. In the Render backend service's Environment settings, add
   `MODEL_API_LIST_MODELS_ON_STARTUP=1`. Save the change and restart/redeploy the
   service so the new process runs startup. Keep the existing `MODEL_API_KEY` and
   `MODEL_API_BASE_URL`; the diagnostic shares generation's client configuration.
2. Read the backend service logs for `Meta startup model discovery`.
   A successful result contains only sanitized `model_ids` and
   `'muse-spark-1.3_available': True` or `False`.
   `True` confirms that the models endpoint lists that model for the deployed
   credentials and endpoint. `False` means it was absent from a successful list;
   listing alone does not prove that a completion request will succeed.
3. If the log says `Meta startup model discovery failed`, inspect
   `upstream_status`, `exception_type`, `provider_code`, `provider_type`,
   `provider_param`, and `request_id`. A failed list request cannot establish
   whether the key has model access. No response body or exception message is
   logged. Missing credentials or configuration errors also leave startup healthy.
4. Remove the variable or set it to `0`, save, and restart/redeploy. Only the exact
   value `1` enables discovery. Remove this temporary diagnostic code once the
   production access issue is resolved.

The diagnostic sends only GET model-list requests (including pagination); it
never sends a prompt. It uses no retries, a five-second HTTP timeout, and a
six-second overall deadline. Startup proceeds after success or failure. SDK and
transport logging is temporarily suppressed during discovery and the previous
logging threshold is restored afterward; other application logs during that
brief startup interval are also suppressed. Safe identifier filtering can omit
unusual model IDs from the logged list. Each process runs discovery once at
startup while enabled.

Tests use a local HTTP transport, with no real credentials or Meta requests:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_startup_diagnostic.py backend/tests/test_ai.py backend/tests/test_meta_smoke.py -q
```
