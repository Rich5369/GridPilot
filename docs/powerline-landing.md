# Landing refinement — draft pending original images

**This task is partially implemented. The exact photograph and visual reference are missing. Do not treat the draft as a completed image implementation.**

Starting main: `0f4779f` (merged dashboard cleanup PR #62). Branch: `feature/powerline-landing`. Working tree was clean. Origin was fetched and the ten most recent PRs reviewed, including #59 (Cloud Blue theme), #60 (softer backgrounds), #61 (Advisor replies), and #62 (dashboard clarity). All applicable merged work is included; there were no open PRs. The branch was already at current main, so no duplicate integration was needed.

## Already complete before this change

The existing landing had the required logo/navigation, headline and two CTA routes, a single-screen desktop layout, and the separate Learn more page. The three feature cards mentioned in the reference were already absent from the repository. These behaviors were reused rather than recreated.

## Implemented now

- Updated the description to the exact requested wording: “Understand your energy use, explore ways to lower costs, and plan around your business operations.”
- Added the exact three-step heading, titles and descriptions as a compact ordered list with small numbered markers. No feature cards, promotional boxes, footer or additional sections were added.
- Added a subtle landing-only background using low-contrast CSS gradients and a curved edge layer. Existing global tokens and other page styles remain unchanged.
- Prepared a desktop hero with approximately 45% text and 55% image space, followed immediately by the steps. The image column is empty pending the original photograph. No broken image, substitute photo, generated image or user-facing implementation placeholder is rendered. The previous dashboard preview is removed from this landing page.
- Mobile uses ordinary flow and stacks the steps, with scrolling available for smaller screens and enlarged text.

## Required to finish

Only the text request was attached. No PNG, JPEG, WebP or AVIF reference files exist in the supplied attachments, and the repository assets do not contain the specified transmission-tower/blue-sky/yellow-field photo. The existing `hero.png` is a generic transparent illustration; `commercial-building.webp` depicts a building and vans. Neither is an acceptable substitute.

Please supply Image 1 (layout reference) and Image 2 (the exact original powerline photograph), or accessible paths to those files. **Image asset location: no photo asset added yet.** Once supplied, copy/optimize the original under `frontend/src/assets/`, integrate it into the reserved hero column, preserve the tower and yellow field in the crop, and repeat the desktop/mobile fit and contrast checks with the actual photo. Matching the reference, image authenticity, focal point and crop have not been verified.

## Scope and files

- `frontend/src/pages/Welcome.tsx`: changes only the Landing component and imports its stylesheet. Header and LearnMore implementations are unchanged.
- `frontend/src/pages/landing.css`: all selectors are scoped to the landing page or its descendants. No global theme or workspace style edits.
- `scripts/verify_powerline_landing.cjs`: browser checks with explicit partial/image-missing status.
- `artifacts/powerline-landing/*`: screenshots of the **photo-pending draft**, plus verification results.
- This document records current completion and remaining work.

Dashboard, setup, Savings, Energy Advisor, storage, API schemas, backend calculations and dependencies were not changed.

## Validation

- **320 frontend tests passed**; 2 opt-in HTTP tests were skipped. No new live backend calculation is claimed for this landing-only change.
- **TypeScript and production build passed.** Existing large-chunk advisory remains.
- **Lint passed** with the two existing CostBreakdown Fast Refresh warnings.
- Browser checks confirm the entire landing and three steps fit without vertical/horizontal overflow at **1366×768, 1440×900 and 1920×1080**. These measurements must be repeated after inserting the missing photograph.
- Mobile 390×844 screenshot and enlarged-text access check at 320×480 passed. Desktop/mobile WCAG A/AA scans report **zero violations**, with no page errors.
- Both CTAs, the Learn more return action, setup validation, logo navigation and exact saved-draft preservation passed. Existing verified example dashboard, Advisor return and Energy plan also remain functional without replacing the saved draft. Browser health is stubbed; AI endpoints are blocked. The existing example contains verified synthetic data, not a new backend execution.

Run with local Vite at port 5173:

```sh
npm test --prefix frontend -- --maxWorkers=2
npm run lint --prefix frontend
npm run build --prefix frontend
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright node scripts/verify_powerline_landing.cjs
```

Draft screenshots: [1366 desktop](../artifacts/powerline-landing/desktop-1366.png), [1440 desktop](../artifacts/powerline-landing/desktop-1440.png), [1920 desktop](../artifacts/powerline-landing/desktop-1920.png), [mobile](../artifacts/powerline-landing/mobile-390.png). [Verification report](../artifacts/powerline-landing/verification.json).

No merge or explicit deployment performed. PR should remain draft until the required images are supplied and verified.
