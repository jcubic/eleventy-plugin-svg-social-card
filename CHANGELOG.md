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
