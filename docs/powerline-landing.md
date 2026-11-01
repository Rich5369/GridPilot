# Cloud Blue landing refinement

Starting main: `0f4779f` (merged dashboard cleanup PR #62). Branch: `feature/powerline-landing`. PR: [#63](https://github.com/Rich5369/GridPilot/pull/63).

The working tree was clean before the initial implementation. Origin and recent PRs were checked, including #59 (Cloud Blue theme), #60 (softer backgrounds), #61 (Advisor replies), and #62 (dashboard clarity). All applicable merged work is included. PR #63 was the only open PR when the supplied images were integrated; main remained at `0f4779f`. No unfinished PR was merged.

## Existing work reused

The landing already had the required logo/navigation, headline, two CTA routes, one-screen desktop layout, and separate Learn more page. The three feature cards mentioned in the reference were already absent. These behaviors are reused.

## Final design

- Header → hero with the exact supplied photograph → three-step process. No feature cards, additional promotional boxes, footer, Pricing or Log in.
- Exact requested headline, description, button labels and three-step copy. The steps use small numbered markers and a centered heading positioned directly below the hero.
- Approximately 45% text / 55% photograph on desktop. The photo uses a light border, moderate rounded corners and a soft shadow. Its crop preserves the primary tower and the yellow field.
- Lightweight landing-only CSS creates soft atmospheric blue transitions and restrained curved edge shapes, guided by the supplied full-page design reference. Existing shared Cloud Blue tokens are retained; no new global theme.
- Mobile stacks heading, description, buttons, photograph and steps, allowing natural scrolling. Small screens and enlarged text are not clipped.
- Landing logo and CTAs retain existing routes. Saved building information is not reset when returning home.

## Exact photograph and reference

Both inline images are now available. The first is the required original powerline photograph; the second is the full landing-page design reference. The layout follows the second image while honoring the written request to omit its feature-card row and unsupported navigation and to retain the specified headline, description and CTA labels.

**Asset:** `frontend/src/assets/powerline.png` (1013×672, 936,439 bytes).

The PNG is copied byte-for-byte from the user-supplied image. SHA-256:

```text
3ff8f7586dd260586d1d83a36609a981c999d9189b87dc50f599bad0f493e377
```

No image was generated, sourced from stock, recolored or recreated. Only CSS presentation crops it within the hero. The full original image remains in the asset. The image uses its original PNG encoding to retain the exact supplied bytes. The earlier photo-pending draft has been replaced, including its screenshots and verification report.

## Files changed

- `frontend/src/pages/Welcome.tsx`: Landing component and its photo import. Header and LearnMore implementations are unchanged.
- `frontend/src/pages/landing.css`: scoped layout, background texture, photo and process styling.
- `frontend/src/assets/powerline.png`: exact supplied photo.
- `scripts/verify_powerline_landing.cjs`: browser checks and photo identity/dimension checks.
- `artifacts/powerline-landing/*`: desktop/mobile screenshots and verification results.
- This document records implementation, provenance and validation.

Dashboard, building setup, Savings, Energy Advisor, storage, backend calculations, API schemas and dependencies are unchanged.

## Validation

- **320 frontend tests passed**, with 2 opt-in HTTP tests skipped. No new live backend calculation is claimed for this landing-only change.
- **TypeScript and production build passed.** Existing large-chunk advisory remains.
- **Lint passed** with the two existing CostBreakdown Fast Refresh warnings.
- Chromium verifies the entire landing, photograph and three steps fit without vertical/horizontal overflow at **1366×768, 1440×900 and 1920×1080**.
- Mobile screenshot at 390×844 and enlarged-text access at 320×480 confirm natural scrolling with accessible content. The photo's tower and yellow field were visually checked on desktop/mobile against the supplied image.
- Desktop/mobile WCAG A/AA scans report **zero violations**, with no page errors.
- Both CTAs, Learn more's home action, setup validation, logo navigation and exact saved-draft preservation pass. The existing verified example dashboard, Advisor return and Energy plan also work without replacing the saved draft. Browser health is stubbed and AI endpoints are blocked; the example uses existing verified synthetic data.

Run with Vite at port 5173:

```sh
npm test --prefix frontend -- --maxWorkers=2
npm run lint --prefix frontend
npm run build --prefix frontend
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright node scripts/verify_powerline_landing.cjs
```

Screenshots: [1366 desktop](../artifacts/powerline-landing/desktop-1366.png), [1440 desktop](../artifacts/powerline-landing/desktop-1440.png), [1920 desktop](../artifacts/powerline-landing/desktop-1920.png), [mobile](../artifacts/powerline-landing/mobile-390.png). [Verification report](../artifacts/powerline-landing/verification.json).

Prepared for review. No merge or explicit deployment performed.
