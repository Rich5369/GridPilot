# Setup-first GridPilot visual redesign

Implemented on `feature/setup-first-visual-redesign`, from
`0f23b56be9a5c47b049ace8ab96ec16c54753b6c`. The user subsequently authorized updating the team's existing public website.
Before publishing, newly merged main `6c8c02c93786e90c5f24386b199cc0f5774b4e9e`
(PR #43) was incorporated without overlapping edits. The original screenshot
capture's base SHA is not a deployed or committed redesign revision.

## Reference and implementation

The supplied three-panel Richard mockup is the primary design reference:

- Middle: a prominent grouped business form, four-step progress indicator,
  selectable loads/goals, quiet field surfaces and emerald primary actions.
- Right: navy sidebar and building header, compact real-result metric cards,
  blue/teal/purple chart accents and the existing advisor panel.
- Left: commercial architecture at blue hour, warm windows and EV infrastructure.
  The reference is not embedded as a webpage or used to fabricate dashboard data.

The homepage starts with a real four-step setup: business context → energy
profile → goals → workspace review. On mobile the form comes before the
supporting introduction, with full-width business name/type fields and readable
inputs. Navigation anchors lead to real product/model sections. Explore demo is
an explicit alternative; its synthetic inputs remain labeled.

`App.tsx` connects setup to the existing `Dashboard`, using its existing
`ScenarioEditor`, `toScenario`, validation, scheduling modes and API calls.
Business name appears in both desktop navigation and the mobile building header.
Business type, employees, operating hours, optional monthly bill and goals are
passed as session context to the existing advisor and labeled **From setup**.
A monthly bill or employee count never generates hourly demand. Goals do not
alter solver mathematics or imply supported thermal, solar or sustainability
optimization. Blank optional context remains unknown.

The existing energy configuration panel is reused. On this step the authoritative
engineering validator handles fractional values such as 14.4 kWh; native integer
input-step validation does not block submission. Reset is explicitly a non-submit
button. Back navigation retains the setup draft. Returning to business setup
preserves the current edited scenario and scheduling mode; creating a workspace
starts a fresh result session. This is session memory, not accounts, authentication,
persistent storage or equipment connectivity.

The dashboard shares the onboarding colors, borders, forms and spacing. The main
overview shows building demand and daily energy charges directly below the KPI
cards. The existing full electricity explorer remains in **Electricity markets**.
Overview compresses the duplicated feasible comparison summary; the full numerical
comparison remains in **Optimization**, and infeasibility/stale warnings remain
visible. Tariff/cost plots precede detailed device plans. No charts or metrics are
rasterized into decorative imagery.

No backend, optimizer, adapter, shared contract, API route, provider implementation
or deployment settings changed. Real charts still use the submitted Scenario and
actual OptimizationResult. Initial result metrics are unavailable until a real
optimization succeeds. E1 arrays, quality labels, result IDs, exports, What-if
logic and stale-result behavior retain their existing implementation.

## Visual and functional verification

- Frontend: **122 passed, 2 existing opt-in live tests skipped**. Three new setup
  regressions cover fractional energy/input handoff, the three-goal limit, invalid
  windows, reset behavior and the explicit demo action.
- TypeScript/Vite production build passed. Lint passed with the two existing
  CostBreakdown Fast Refresh warnings.
- Real local Vite UI + FastAPI + OR-Tools, Chromium at **1440×1100 and 390×844**.
  No intercepted solver responses, invented results or live Meta calls.
- Actual submitted joint example: site 25 kW, two EVs with 14.4 kWh each in
  [15,22), existing demo fixed demand and equipment. Actual optimized energy
  charges approximately **$20.5760001**, peak **15.8999996875 kW**, total energy
  **128.8 kWh**. The UI shows $20.58 and 15.90 kW from that response.
- Captured full Scenario/mode/response in
  [verification.json](../artifacts/product-redesign/verification.json).
  Tariff-weighted charges and maximum hourly demand reconcile; exported Scenario
  and response exactly equal the request/response captured from that execution.
- Business context reaches the advisor without inference. Draft edits retain
  stale-result warnings. Edited limit/mode survive returning to setup.
- A real 1 kW site-cap scenario returns infeasible, with reasons and null optimized
  metrics/device arrays. The UI shows no actionable optimized plan.
- No horizontal page overflow at either viewport. Screenshots inspected against
  the reference and refined for mobile field width, visible building identity,
  compact result hierarchy and consistent surfaces.
- Targeted axe WCAG A/AA scans: **zero violations** in the homepage, setup energy
  card and dashboard navigation/header/KPI/comparison regions. This is not a
  whole-application accessibility certification or a physical mobile-device test.

Screenshots:

- [Homepage desktop](../artifacts/product-redesign/home-desktop.png) ·
  [mobile](../artifacts/product-redesign/home-mobile.png)
- [Energy setup desktop](../artifacts/product-redesign/energy-profile-desktop.png) ·
  [mobile](../artifacts/product-redesign/energy-profile-mobile.png)
- [Dashboard desktop viewport](../artifacts/product-redesign/dashboard-desktop-viewport.png) ·
  [mobile viewport](../artifacts/product-redesign/dashboard-mobile-viewport.png)
- [Full dashboard](../artifacts/product-redesign/dashboard-desktop.png) ·
  [mobile](../artifacts/product-redesign/dashboard-mobile.png)
- [Advisor desktop](../artifacts/product-redesign/advisor-desktop.png) ·
  [mobile](../artifacts/product-redesign/advisor-mobile.png)
- [Infeasible result](../artifacts/product-redesign/infeasible-desktop.png) ·
  [mobile](../artifacts/product-redesign/infeasible-mobile.png)

## Reproduce locally

Use existing app dependencies/virtualenv; browser QA dependencies live outside the
application (`playwright` and `@axe-core/playwright`). No runtime package changes.

```bash
CORS_ORIGINS=http://127.0.0.1:5292 MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8012
```

In a second terminal:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8012 npm --prefix frontend run dev -- --host 127.0.0.1 --port 5292
```

In a third, point to the externally installed QA modules:

```bash
PLAYWRIGHT_MODULE=/tmp/gridpilot-visual-qa/node_modules/playwright AXE_PLAYWRIGHT_MODULE=/tmp/gridpilot-visual-qa/node_modules/@axe-core/playwright node scripts/verify_product_redesign.cjs
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

The script writes local screenshots/evidence under `artifacts/product-redesign`.
Original local captures use the design base revision plus its redesign working
tree. Publication integrates the latest merged backend audit. Hosted acceptance,
when recorded separately, identifies the actual served frontend rather than
inferring it from local screenshots. No provider quality is inferred.

## Generated image

Final project asset:
[`frontend/src/assets/commercial-building.webp`](../frontend/src/assets/commercial-building.webp),
1774×887, approximately 182 KB. Created with the built-in imagegen tool; converted
to WebP with a temporary Sharp installation (format/compression only). The source
was copied from the tool's generated-image directory; no existing website asset
was overwritten. The prior `hero.png` was an unused starter graphic. The actual
image is clearly labeled as an illustrative site; rooftop solar in a photograph
is not a claim of solar optimization support.

Exact generation prompt:

```text
Use case: ads-marketing. Asset type: wide photographic website introduction image for GridPilot commercial energy planning. Create a polished realistic architectural photograph of a contemporary commercial logistics building at blue hour: warm illuminated glass entrance, restrained rooftop solar panels, two white delivery vans beside neat EV charging posts, subtle teal charging indicator lights, clean paved forecourt, dark navy twilight sky. Calm, credible commercial-energy identity, premium editorial architecture photography, rich navy and slate blue with small emerald highlights and warm interior light. Wide landscape composition, building across lower two thirds with uncluttered dark sky above. No typography, no logos, no watermarks, no charts, no UI, no mock browser frames, no data or metrics. This is a decorative image of an illustrative site, not a real facility or evidence of supported solar optimization. Save the generated image and return the local asset path for use in a React website.
```
