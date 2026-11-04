# Martin & Martin

A static title card with five locally served Geist Pixel shapes, cursor-driven CMY plates, and analytic rain. The page uses HTML, CSS, TypeScript and WebGL2. Cloudflare serves the built files without a Worker script.

## Run locally

- `npm ci`
- `npm run dev` starts the review build. Open `/?tune` to show its controls.
- `npm run typecheck && npm test` checks types and runs the browser tests against built files with their CSP enabled. Install the Chromium browser with `npx playwright install chromium` if needed.
- `npm run build && npm run check:dist` builds and checks the production candidate in `dist/`. `npm run build:review` builds the review in `dist-review/`.
- `uv run --script scripts/make-assets.py` regenerates the pinned Geist subsets, the social card, and the favicon.

## Review and release

The [live tuning preview](https://martin-and-martin-review.harold-martin.workers.dev/?tune) uses the separate `martin-and-martin-review` Worker and sends `X-Robots-Tag: noindex`. Its URL does not require sign-in. Use `1`, `2`, and `3` to compare split styles and `H` to toggle the panel. Copy Link captures the current settings and shape so another reviewer sees the same treatment.

Compare each style in all five shapes on desktop and a physical phone. After a treatment is approved, copy the `settings` object from its tuning URL into `src/release.json`, set `settings.shape` to `random`, and mark the preset approved. The build includes only the split strategy named in that preset. The production deployment command refuses to run until the preset is approved.

Before launching, verify performance on a 2020 MacBook Air and an iPhone 12. After `npm run deploy:production`, check the apex URL's headers, crawlability, and share previews. Once production is verified, retire the separate review Worker. If production needs to be rolled back after a subsequent update, use its preceding Cloudflare deployment.

The design keeps automatic rain and touch drift running with no pause button. It honors the system reduced-motion preference; the project accepts the risk under [WCAG 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html).
