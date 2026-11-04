# Savings UI test fixtures

`savingsCatalog.json` copies the actual v1 backend catalog at merged PR #52.
The fixtures intentionally retain the older additive-field shape for compatibility
coverage; final real-browser checks use the current backend through PR #54.
`warehouseSavingsConversation.json` was generated from
`docs/verification/meta-savings-acceptance-request.json` by the unchanged backend
Savings Engine, with `backend.ai.savings.generate` patched to return a deterministic
category selection. The injected selection requested LED, shutdown, scheduling,
refrigeration and compressed air; the real exclusion logic removed the last three.
Its `source: meta` is a UI fixture branch, **not a genuine Meta response**. No paid
inference or production request generated these files. The engine's real pilot
2,000 kWh/year and unknown financial fields were retained without editing numbers.

Only tests/browser QA import the warehouse response. Production UI uses actual HTTP
responses; its optional LED example is separately and visibly labeled synthetic.

`advisorComparison.json` contains real local solver results for a fictional
25 kW versus 23 kW site-cap comparison with a two-rate tariff. Its Meta source
labels, activity text and qualitative explanation are injected UI test data,
not genuine provider acceptance. Production components never import this fixture.
