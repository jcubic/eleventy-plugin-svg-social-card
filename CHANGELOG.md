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
