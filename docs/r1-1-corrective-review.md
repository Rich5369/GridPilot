# R1.1 corrective review

R1.1 addresses the three frontend findings from the post-merge audit. It is based on `origin/main` at `ee70503816e1697f272d1a7a4410a30c542b39fa`, including teammate PR #30. No solver, optimization behavior, API result contract, AI configuration or deployment settings were changed.

## Changes

1. **Sidebar contrast.** The dark rail (`#153c32`) inherited the light-surface tag color (`#516749`). A scoped `.sidebar-note > .tag` rule now uses `#d1efad` with a coordinated border. The rest of the palette remains unchanged.
2. **Scheduling assumptions.** Replaced the paragraph hidden by the <=1000px rule with a native `<details>/<summary>` disclosure at every width. The select references its summary with `aria-describedby`. EV-only explains that equipment/fixed demand remain unchanged. Joint mode explicitly describes interruptible, continuously adjustable equipment and excludes uninterrupted machine cycles. No duplicate responsive state or altered mode invalidation was introduced.
3. **Submitted hourly inputs.** `ScenarioDemandTable` renders all 24 custom entries or named-source contributions plus the existing combined fixed-demand sum, inside “All scenario settings.” Captions identify the editable draft or submitted snapshot, units, and building-local hour intervals; column headers identify source names. Native table captions/scoped headers and a labeled, focusable horizontal scroll region support keyboard and assistive-technology navigation. Original custom/source strings preserve entered precision and zero values. Incomplete draft profiles are labeled unavailable instead of displaying coerced zero values.

`ScenarioSummary` receives the same parent-owned editor as before. For submitted results, that remains the parsed serialized submission snapshot. The table adds no scenario state and does not read the current draft separately. Detailed input tables remain collapsed with the existing settings disclosure; no additional primary dashboard panels were added.

## Contrast measurements

Computed browser colors and WCAG relative-luminance calculation, using the actual dark rail and compositing the translucent workspace background:

| Text | Before | After / checked minimum |
| --- | --- | --- |
| Workspace tag | **1.96:1** | **9.66:1** |
| Workspace secondary text | Unchanged | **6.56:1** |
| Navigation label | Unchanged | **6.96:1** |
| Inactive navigation | Unchanged | **8.11:1** |
| Active navigation | Unchanged | **9.66:1** |

All checked sidebar text exceeds the 4.5:1 normal-text target. The workspace tag is visible on desktop and hidden with the existing secondary sidebar content at tablet/mobile widths. Browser checks cover widths 1440, 1024, 1000, 768 and 390 with OS light and dark color preferences. GridPilot retains its existing single palette; no theme system was added.

## Verification

- Frontend unit suite: **87 passed**, one opt-in integration test skipped by default. Eight new cases cover native mode disclosures, both profile snapshot lifecycles, all custom entries/precision/zero values, named-source columns/totals, incomplete drafts and demo exclusion.
- Separate live FastAPI integration test: **1 passed**.
- TypeScript (`tsc -b`): passed through the production build.
- Oxlint: passed, with the same two pre-existing Fast Refresh warnings in `CostBreakdown.tsx`.
- Production Vite build: passed. Final Chromium suites use Vite preview with `VITE_API_BASE_URL=http://127.0.0.1:8000` and the unchanged latest-main backend exported outside the working tree.
- Focused R1.1 Chromium suite: passed. Measures contrast, checks 20 mode/width/color-preference combinations, opens/closes disclosures with Enter/Space, inspects accessible text, reads every submitted custom/named hourly value, confirms stale draft isolation, checks table focus/scroll and page overflow, verifies real EV/joint numerical costs/peaks/energy, and exercises joint What-if Apply/Restore.
- Existing workspace, demand-profile and commercial/named-source Chromium suites: all passed. Includes genuine infeasibility, custom/named validation and payloads, responsive chart geometry, stale results, Apply/Restore, and local injected errors/provider unavailability plus native 45-second timeout recovery. No successful live Meta inference is claimed.
- Desktop/mobile screenshots visually inspected. Six scoped axe scans (both modes at 1440/768/390 widths) cover the sidebar and scheduling controls and report zero WCAG A/AA violations; see the accessibility evidence.

No frontend application dependencies were added. Playwright and axe remain external temporary QA tools. Unrelated Meta diagnostic working-tree edits were verified byte-for-byte unchanged and are excluded from this PR. Teammate engineering files are unchanged from main.

## Files

- `frontend/src/index.css`: scoped rail contrast, native disclosure layout and compact table styles.
- `frontend/src/pages/Dashboard.tsx`: accessible mode disclosure; request/snapshot logic unchanged.
- `frontend/src/components/dashboard/ScenarioSummary.tsx`: include the read-only input table within existing settings.
- `frontend/src/components/dashboard/ScenarioDemandTable.tsx`: hourly inspection component.
- `frontend/src/components/dashboard/ScenarioDemandTable.test.tsx`, `frontend/src/pages/Dashboard.test.tsx`: regression coverage.
- `scripts/verify_r11_browser.cjs`: focused real-backend browser regression/measurement script.
- `artifacts/r1-1/`: before/after captures, computed contrast and request/results, scoped accessibility checks, and browser logs.

## Screenshots and evidence

| Before | After |
| --- | --- |
| [Desktop, low-contrast tag](../artifacts/r1-1/before-desktop.png) | [Desktop, corrected tag and expanded assumptions](../artifacts/r1-1/after-1440.png) |
| [Mobile, missing assumptions](../artifacts/r1-1/before-mobile.png) | [Mobile, expanded joint assumptions](../artifacts/r1-1/after-390.png) |
| [Submitted settings without hourly inputs](../artifacts/r1-1/before-submitted-profile.png) | [Custom submitted inputs](../artifacts/r1-1/custom-submitted-1440.png) |

[Tablet assumptions](../artifacts/r1-1/after-768.png) · [Named submitted inputs](../artifacts/r1-1/named-submitted-1440.png) · [Named inputs on mobile](../artifacts/r1-1/named-submitted-390.png) · [Computed contrast and genuine result records](../artifacts/r1-1/verification.json) · [Scoped accessibility scans](../artifacts/r1-1/accessibility.json)

The profile screenshots intentionally retain stale results: they demonstrate that submitted source values still show the original inputs after the editable draft changes.

## Reproduction

Run the unchanged backend on :8000, then:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8000 npm --prefix frontend run build
npm --prefix frontend run preview -- --host 127.0.0.1 --port 5173
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_r11_browser.cjs
```

Requires an external Playwright installation and Chromium. The existing three acceptance scripts use the same local endpoints. No deployment or merge is part of verification.

## Limitations

This focused change does not fix inherited main-content breadcrumb/eyebrow/footer contrast findings or claim full application WCAG certification. Native keyboard/accessible-tree checks and scoped axe scans are not a manual screen-reader certification. Cross-viewport screenshot QA also exposed a chart tooltip retaining an old hover position; input-table checks park the pointer outside the chart to isolate table layout. Chart hover/resize behavior was not changed by this patch. Default demo hourly fixtures remain represented by the existing preview rather than a new inspection table. Device schedule UI and AI provider acceptance remain outside R1.1; PR #30 engineering functionality was preserved.
