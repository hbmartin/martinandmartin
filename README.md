# Martin & Martin

A title card with locally served Geist Pixel Circle, smooth cursor-driven CMY plates, and refractive water. The page uses HTML, CSS, TypeScript and WebGL2. Cloudflare serves the built files without a Worker script.

## Run locally

- `npm ci`
- `npm run dev` starts the review build. Open `/?tune` to show its controls.
- `npm run typecheck && npm test` checks types and runs the Chromium browser tests against built files with their CSP enabled. Run `npm test -- --browser=webkit` for WebKit coverage as well. Install the browsers with `npx playwright install chromium webkit` if needed.
- `npm run build && npm run check:dist` builds and checks the production candidate in `dist/`. `npm run build:review` builds the review in `dist-review/`.
- `uv run --script scripts/make-assets.py` regenerates the pinned Circle subset, the social card, and the favicon, and removes unused font variants.

## Water and typography

Circle is the only font in both builds and the no-JavaScript fallback. Old tuning links with a different `shape` are accepted but always render Circle. Font failure or timeout still uses system monospace.

The review panel offers **Quiet Black Pool** (the default) and **Reflective Liquid**. They share the same wave motion and CMY refraction; Reflective Liquid uses broader, stronger reflections. Copied version-1 URLs include `settings.waterLook`; absent or invalid values use `quiet`. There is no water toggle on the public page.

Each drop has a fixed strength, radius and birth time. An original analytical wave model combines a leading crest, a damped oscillating tail and a smaller, faster capillary packet. Signed heights and gradients add before refraction and directional lighting, allowing interference. The CMY plates are refracted separately before compositing. This is an art-directed approximation, not a full fluid simulation; it has no shoreline reflections or external environment textures. [Wipples by Antonalog](https://www.shadertoy.com/view/ldB3Wd) informed the visual direction; its source and textures are not bundled.

Automatic rain arrives every 2.5–5 seconds, with 4.5 seconds of decay. Clicks and taps make stronger drops; dragging controls the plates without emitting a wake. At most 16 drops are active; additional impulses are ignored until a slot is free so existing waves do not pop away. Drop centers and radii scale with the viewport, and their elapsed-time evaluation does not depend on frame rate. The ampersand is 90% of the word size, with extra spacing before the more gently refracted tagline.

## Review and release

The [live tuning preview](https://martin-and-martin-review.harold-martin.workers.dev/?tune) uses the separate `martin-and-martin-review` Worker and sends `X-Robots-Tag: noindex`. Its URL does not require sign-in. Use `1`, `2`, and `3` to compare split styles and `H` to toggle the panel. Copy Link captures the current settings and water treatment so another reviewer sees the same treatment. Local changes appear there only after a review deployment.

Compare both water treatments on desktop and a physical phone. After a treatment is approved, copy the `settings` object from its tuning URL into `src/release.json`, set `settings.shape` to `circle`, and mark the preset approved. The build includes only the split strategy named in that preset. The production deployment command refuses to run until the preset is approved. The current candidate uses Smooth Slide and Quiet Black Pool and remains unapproved.

Before launching, verify performance on a 2020 MacBook Air and an iPhone 12. After `npm run deploy:production`, check the apex URL's headers, crawlability, and share previews. Once production is verified, retire the separate review Worker. If production needs to be rolled back after a subsequent update, use its preceding Cloudflare deployment.

Both browser suites exercise the actual GPU shader and rendering fallbacks. WebKit uses the manual-copy fallback and synthetic Pointer Events for drag handling because its automation API lacks Chromium's clipboard permissions and CDP touch-drag support; taps use native automation in both engines. Playwright's WebKit screenshot helper injects a temporary stylesheet that the page's CSP blocks. The visual tests exclude that exact diagnostic only during screenshots, while page-load and application errors remain failures. Device emulation does not replace the physical-device performance checks above.

The design keeps automatic rain and touch drift running with no pause button. It honors the system reduced-motion preference; the project accepts the risk under [WCAG 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html).
