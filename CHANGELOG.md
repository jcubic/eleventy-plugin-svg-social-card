## 0.3.0
* in-memory render cache (on by default, `cache` option). Each card is hashed
  by its rendered SVG — the exact bytes that would be screenshotted, capturing
  both `data()` and template changes. On a `--watch`/`--serve` rebuild an
  unchanged card is skipped: no temp file, no browser tab. Only cards whose
  data or template actually changed get re-rendered
* the headless browser is now launched **lazily**, on the first card that needs
  rendering, instead of unconditionally at `eleventy.before`. A rebuild where
  every card is cached never starts Chromium at all
* new `enabled` option — a hard on/off switch for card generation. Accepts a
  boolean or a predicate `({ runMode }) => boolean`, so you can skip rendering
  during `--watch`/`--serve` and only pay for it on a real build. When disabled
  the browser is never launched and `{% card "emit" %}` still returns the card
  URL so meta tags stay valid

## 0.2.4
* serialize screenshots by default (`concurrency: 1`). Eleventy renders pages
  in parallel, so on larger sites the plugin was opening dozens of Chromium
  tabs simultaneously — enough to starve GitHub Actions runners and make
  `Page.captureScreenshot` stall until puppeteer's 180s protocolTimeout.
  Sequential renders are still fast (tens of ms per card) and reliable
* new `concurrency` option to raise the cap when you know the runner can
  handle it
* default Chromium args now include `--disable-gpu` (CI has no GPU)
* default `protocolTimeout` clamped to 60s so a stuck render fails fast
  instead of burning the job's wall-clock budget

## 0.2.3
* pass `--disable-dev-shm-usage` to Chromium so CI/Docker runs don't stall on
  a full `/dev/shm` (fixes indefinite `Page.captureScreenshot` hangs on
  GitHub Actions)
* bound `browser.close()` in `eleventy.after` so a zombie browser can't keep
  the Node process alive past a failed build
* new `launchOptions` plugin option that gets merged into `puppeteer.launch()`
  without having to replace the `browser` factory

## 0.2.2
* fix cascading cleanup errors in a GitHub workflow

## 0.2.1
* minor issue in README

## 0.2.0
* make URL emit optional

## 0.1.1
* add logs to the elventy output
* simplify documentation

## 0.1.0
* Inital version
