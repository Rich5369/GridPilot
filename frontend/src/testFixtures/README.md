# Savings UI test fixtures

`savingsCatalog.json` copies the actual v1 backend catalog.
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
