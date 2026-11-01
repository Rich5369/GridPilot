# ROI numerical range and acceptance

An upfront cost of `1e-310` is positive, finite and accepted by the input model.
For the fictional LED reference (12,500 kWh/year, $2,500 gross energy savings,
$300 recurring non-energy benefit, $100 incremental expense), net savings are
$2,700/year. Decimal computes the finite annual ROI `2.7e315` percent.
Converting that Decimal to Python float produces positive infinity.
`Recommendation` rejects infinity with a Pydantic `finite_number` error during
model construction; the uncaught error previously became HTTP 500. Decimal
arithmetic, money rounding and JSON serialization were not the initiating fault.

The calculator now checks the converted ROI with `math.isfinite`. A nonfinite
ROI becomes `annual_simple_roi_percent: null`, with a `Numerical range:` warning
on the recommendation and its existing top-level warning copy. This means the
defined ratio cannot be represented as a finite API number, rather than missing
evidence or zero savings. No maximum, guarantee or substitute return is invented.
The OpenAPI field description documents this distinction. Finite ROI values use
the same conversion and formula as before; negative overflow is handled likewise.

All six energy equations, energy/gross/net savings, recurring benefits, expense
handling, upfront cost and payback calculations are unchanged. Zero upfront cost
still has null ROI and zero payback when net savings are positive. Zero net has
zero ROI for positive cost and no payback; negative net retains signed finite ROI
and no payback. Missing financial inputs remain unknown. Extremely small payback
values retain the existing float precision; this fix does not alter payback.

## Verification

The minimal API regression first failed against main with HTTP 500. After the
fix, both `1e-310` and the smallest positive float return HTTP 200, null ROI and
the explicit warning, without nonfinite JSON. The fictional reference retains
12,500 kWh, $2,500 gross, $300 recurring benefit and $2,700 net. Its `1e-310`
upfront cost retains the existing approximately `3.7037037036e-314` year payback.
At an ordinary $2,700 upfront cost, payback remains 1 year and ROI 100%.

`backend/tests/test_savings_roi_range.py` adds 43 regressions: ordinary, zero,
missing, maximum allowed and subnormal costs; adjacent floats on either side of
the positive overflow boundary; positive/zero/negative net; missing annual
expense; omitted versus explicit-zero recurring benefit; all six reference
equations; warning propagation and API serialization. Full offline backend
acceptance passed **866 tests**, with one existing Starlette TestClient
deprecation warning. No frontend, optimizer, deployment or paid Meta work is
part of this change.

```bash
/workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests/test_savings_roi_range.py -q
MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests -q
git diff --check
```

## Minimal production acceptance after review and deployment

No deployment is performed by this PR. After a separately authorized merge and
deployment, record the deployed backend revision and check `/api/health`. Send
two deterministic, explicitly fictional `/api/savings/recommendations` requests
with the reference LED evidence, a confirmed fictional $0.20/kWh customer energy
rate valid on the test date, $300 documented recurring benefit and $100 annual
expense. Use upfront costs $2,700 and `1e-310`, respectively.

Require HTTP 200 and identical energy/gross/net/recurring values in both. Expect
1-year payback and 100% ROI for $2,700; null ROI with the numerical-range warning
and unchanged tiny payback for `1e-310`. Confirm the response contains no Infinity
or NaN and the warnings are visible through the existing recommendation contract.
No AI endpoint, customer data, paid provider or production load test is needed.
