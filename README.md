# eleventy-plugin-svg-social-card

[![npm](https://img.shields.io/badge/npm-0.3.0-yellow.svg)](https://www.npmjs.com/package/eleventy-plugin-svg-social-card)
[![github repo](https://img.shields.io/badge/github-repo-orange?logo=github)](https://github.com/jcubic/eleventy-plugin-svg-social-card)
[![Tests](https://github.com/jcubic/eleventy-plugin-svg-social-card/actions/workflows/test.yml/badge.svg)](https://github.com/jcubic/eleventy-plugin-svg-social-card/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/jcubic/eleventy-plugin-svg-social-card/badge.svg?branch=master)](https://coveralls.io/github/jcubic/eleventy-plugin-svg-social-card?branch=master)
[![LICENSE MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/jcubic/eleventy-plugin-svg-social-card/blob/master/LICENSE)

Generate per-page social card images (Open Graph / Twitter card) for your
Eleventy site from an SVG template, rendered via a headless browser.

- Works with any layout engine Eleventy supports (Liquid, Nunjucks, JS…).
- One SVG template with `{{ placeholders }}`, one shortcode per page.
- Safe-by-default: XML-escapes every interpolated value.
- Unique per-page temp file — no race conditions when Eleventy builds in parallel.
- `{% card %}` renders nothing by default (pure side effect); add `"emit"`
  (`{% card "emit" %}`) when you want the URL handed back so you can capture
  it for meta tags.

## Install

```bash
npm install eleventy-plugin-svg-social-card
```

Puppeteer bundles its own Chromium — no extra install step.

## Quick start

### 1. Design your card as an SVG

Create `src/card/social-card.svg` (1200×630 is the OG standard). Use Liquid
`{{ placeholders }}` for the dynamic text:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xhtml="http://www.w3.org/1999/xhtml"
     viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#0b0b12"/>
  <foreignObject x="80" y="120" width="1040" height="360">
    <xhtml:div style="font: 700 64px sans-serif; color: #fff;">
      {{ title }}
    </xhtml:div>
  </foreignObject>
  <text x="80" y="560" fill="#ddd" font-size="28" font-family="sans-serif">
    {{ author }} · {{ date }}
  </text>
</svg>
```

### 2. Register the plugin

```js
// .eleventy.js
import socialCard from 'eleventy-plugin-svg-social-card';

export default function(eleventyConfig) {
    eleventyConfig.addPlugin(socialCard, {
        template: 'src/card/social-card.svg',
        outputDir: '_site/img/social-cards',
        urlPath: '/img/social-cards',
        data(ctx) {
            return {
                title:  ctx.title,
                author: ctx.author ?? 'Anonymous',
                date:   new Date(ctx.date).toDateString(),
            };
        },
    });
}
```

### 3. Use the shortcode

In your **article layout** (not in individual posts — put it in one place):

```liquid
---
layout: base.liquid
---
{% card %}
<article>
  <h1>{{ title }}</h1>
  {{ content }}
</article>
```

The shortcode produces no output — it writes the PNG to
`<outputDir>/<page.fileSlug>.png` and that's it.

To use the URL in meta tags, add `"emit"` so the shortcode returns it, and
capture:

```liquid
{%- capture cardUrl -%}{% card "emit" %}{%- endcapture -%}

<meta property="og:image"        content="{{ site.url }}{{ cardUrl }}" />
<meta property="og:image:width"  content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:image"       content="{{ site.url }}{{ cardUrl }}" />
```

Nunjucks: `{% set cardUrl = card("emit") %}`.

`"emit"` is the only literal the shortcode recognises here — any other string
is treated as the card-variant name (see below).

## Multiple cards (articles, pages, tags…)

If you want more than one card design — say, a dark card for blog posts and
a light card for static pages — pass a `cards` map instead of a single
`template`. The shortcode then takes the card name as an argument:

```js
// .eleventy.js
eleventyConfig.addPlugin(socialCard, {
    shortcode: 'card',            // default
    cards: {
        article: {
            template: 'src/cards/article.svg',
            outputDir: '_site/img/articles',
            urlPath:   '/img/articles',
            data(ctx) {
                return {
                    title:  ctx.title,
                    author: ctx.author,
                    date:   new Date(ctx.date).toDateString(),
                };
            },
        },
        pages: {
            template: 'src/cards/page.svg',
            outputDir: '_site/img/pages',
            urlPath:   '/img/pages',
            data(ctx) {
                return { title: ctx.title, site: ctx.siteName };
            },
        },
    },
});
```

In your article layout:

```liquid
{% card "article" %}
```

In your page layout:

```liquid
{% card "pages" %}
```

To emit the URL in multi-card mode, pass `"emit"` as the second argument:

```liquid
{%- capture cardUrl -%}{% card "article" "emit" %}{%- endcapture -%}
```

(`"emit"` is a reserved name — you can't name a card variant `emit`.)

Each variant has its own template, output directory, and `data()`, so you can
tailor both the design and the variables it receives. Everything except
`template` and `data` is optional per-variant and falls back to the plugin
defaults.

If you call the shortcode without a name (or with one that doesn't exist),
the build fails with the list of available cards — no silently-wrong PNGs.

**Exception:** if `cards` has exactly one entry, `{% card %}` with no argument
resolves to that single card. You only need to pass a name when there's more
than one to disambiguate.

See `examples/single/` and `examples/multiple/` in this repo for runnable
end-to-end projects.

## Designing the SVG

### Use Inkscape

[Inkscape](https://inkscape.org/) is the recommended editor — SVG is its
native file format, so there's no lossy export step and the `.svg` you commit
is the same file you edit. Design at **1200×630** (the Open Graph standard)
and save as *Plain SVG* (File → Save As → *Plain SVG (\*.svg)*). Plain SVG
drops Inkscape-specific metadata and keeps the file small.

### Re-open the file in a text editor after saving

This is easy to miss and will silently break your card:

**Inkscape URL-encodes curly braces inside attribute values on save.**
If you type `{{ path }}/avatars/{{ username }}.jpg` into an image's
*Image Properties → URL* field, Inkscape saves it as:

```xml
xlink:href="%7B%7B%20path%20%7D%7D/avatars/%7B%7B%20username%20%7D%7D.jpg"
```

The template engine won't see any placeholders, so the `href` is a literal
string and the image won't load. Same thing happens with `href`, `style`
URLs, and any other attribute where you want a `{{ ... }}`.

**After every save in Inkscape, open the `.svg` in a text editor** and
replace each `%7B%7B%20name%20%7D%7D` with the literal `{{ name }}`.
Placeholders inside element text (e.g. between `<text>` and `</text>`, or
inside a `<foreignObject>`'s `<div>`) survive the save — it's only
attributes that get encoded.

A quick find-and-replace recipe:

| Encoded                       | Replace with      |
| ----------------------------- | ----------------- |
| `%7B%7B%20`                   | `{{ `             |
| `%20%7D%7D`                   | ` }}`             |

### Why `foreignObject` + `<xhtml:div>` for the title

Raw SVG `<text>` does not wrap. Each line must be its own `<tspan>` (or
separate `<text>` element) with an explicit `x` and `y` — the renderer never
breaks a long string across multiple lines automatically. That makes SVG
`<text>` fine for single-line labels (author, date) but painful for article
titles of unpredictable length.

`<foreignObject>` lets you embed an HTML fragment inside the SVG. The
headless browser that renders the card treats the `<xhtml:div>` as real HTML
and wraps the text naturally using CSS (`width`, `font-size`, `line-height`).
When you screenshot the page, that wrapped HTML is baked into the PNG.

```xml
<foreignObject x="80" y="120" width="1040" height="360">
  <xhtml:div style="font: 700 64px sans-serif; color: #fff; line-height: 1.15;">
    {{ title }}
  </xhtml:div>
</foreignObject>
```

Two things to remember:

- Declare the XHTML namespace on the root `<svg>`:
  `xmlns:xhtml="http://www.w3.org/1999/xhtml"`.
- The `width` on `<foreignObject>` is what the HTML wraps against. Tune it
  with the longest realistic title you expect.

Use `<text>` for anything that's naturally one line (byline, date, tag) —
it's simpler and renders identically across SVG tools. Use
`<foreignObject>` only where wrapping matters.

### Why a real browser (and Puppeteer)

`<foreignObject>` is part of the SVG spec, but only **browser-grade
renderers** actually implement it. If you open your template in Inkscape,
preview it in most SVG viewers, or render it with ImageMagick / `librsvg` /
`resvg`, the area inside `<foreignObject>` will be **blank** — you'll see
the background and the `<text>` elements, but no title.

That's not a bug in the tool; it's a conscious omission. Implementing
`<foreignObject>` requires a full HTML/CSS engine embedded inside the SVG
renderer (layout, font shaping, line-breaking, inline formatting — the
whole pipeline). Drawing tools and server-side converters deliberately
skip it because the cost is enormous and the gain is narrow.

Browsers already have that engine, so rendering the SVG in a headless
Chromium and screenshotting the result is the only reliable way to get a
PNG with properly-wrapped HTML text baked in. That's what this plugin
does, and why it ships with **Puppeteer** — which bundles its own
Chromium and works cross-distro without needing system packages.

In short: don't be alarmed when your template looks half-empty in
Inkscape's preview. It'll render correctly when the plugin screenshots it.

## Options

| Option       | Type                           | Default                        | Description |
| ------------ | ------------------------------ | ------------------------------ | ----------- |
| `template`   | `string` **(required)**        | —                              | Path to the `.svg` template. |
| `data`       | `function` **(required)**      | —                              | `(ctx, page) => {...}`. Returns the variables for the SVG. `ctx` is the page's template data; `page` is Eleventy's `page` object. |
| `shortcode`  | `string`                       | `'card'`                       | Shortcode name. |
| `enabled`    | `boolean` \| `({ runMode }) => boolean` | `true`                | Hard on/off switch for card generation. Pass `false`, or a predicate that receives Eleventy's run mode (`'build'`, `'watch'`, `'serve'`), to skip the headless-browser render entirely. See [Fast watch mode](#fast-watch-mode). |
| `cache`      | `boolean`                      | `true`                          | Skip re-rendering a card when its rendered SVG is byte-for-byte identical to the last one written to the same path. The hash cache lives in memory and persists across `--watch`/`--serve` rebuilds, so only cards whose data or template actually changed get re-screenshotted. Set `false` to always render. See [Fast watch mode](#fast-watch-mode). |
| `cards`      | `object` (see below)           | `null`                         | If present, register a multi-variant shortcode — each key is a card name, each value is a variant-scoped options object. Ignores top-level `template`/`data`/`outputDir`/etc. when set. |
| `outputDir`  | `string`                       | `'_site/img/social-cards'`     | Where to write the PNG. |
| `urlPath`    | `string`                       | `'/img/social-cards'`          | Public URL prefix (what the shortcode returns). |
| `filename`   | `(page) => string`             | ``page => `${page.fileSlug}.png` `` | Output filename. |
| `viewport`   | `{width, height}`              | `{1200, 630}`                  | Browser viewport for the screenshot. |
| `delay`      | `number` (ms)                  | `100`                          | Pause after page load, so fonts settle. |
| `escape`     | `boolean`                      | `true`                         | Auto XML-escape all values returned by `data()`. Disable if you need to inject raw markup. |
| `browser`    | `async () => Browser`          | `null`                         | Optional factory for a custom Puppeteer `Browser` instance. Default launches with `headless: 'new'` and CI-safe flags (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`) and a 60s `protocolTimeout`. |
| `launchOptions` | `object`                    | `{}`                           | Extra options merged into the default `puppeteer.launch()` call (ignored when `browser` is set). Use this to append args, raise `protocolTimeout`, set `executablePath`, etc. without replacing the factory. |
| `concurrency` | `number`                      | `1`                            | Max number of Chromium tabs that render in parallel. Default `1` is sequential — the safest choice on CI, where parallel renders starve `/dev/shm` and stall `Page.captureScreenshot`. Raise it if you've profiled your build and your runner can cope. |

## Only show the meta tag for pages that actually have a card

If your `<head>` is shared across article and non-article pages, guard the
meta tag with a tag check on the frontmatter — no collection needed:

```liquid
{% if tags contains 'post' %}
  {%- capture cardUrl -%}{% card "emit" %}{%- endcapture -%}
  <meta property="og:image" content="{{ site.url }}{{ cardUrl }}" />
{% else %}
  <meta property="og:image" content="{{ site.url }}/img/default-card.png" />
{% endif %}
```

That's it. Non-article pages skip the whole block — the shortcode never
runs for them, so no stray PNGs get generated.

In Nunjucks: `{% if "post" in tags %}` / `{% set cardUrl = card("emit") %}`.

If your tag naming is more elaborate — for example multi-language tags like
`articles_en`, `articles_pl` — add a filter that returns truthy for any
article tag and use it inline:

```js
eleventyConfig.addFilter('isArticle', (tags) =>
    Array.isArray(tags) && tags.some(t => t.startsWith('articles_'))
);
```

```liquid
{% if tags | isArticle %}
  {%- capture cardUrl -%}{% card "emit" %}{%- endcapture -%}
  <meta property="og:image" content="{{ site.url }}{{ cardUrl }}" />
{% endif %}
```

## Fast watch mode

Rendering a card through a headless browser is the slow part of a build. During
`eleventy --serve` / `--watch` you save constantly, and re-screenshotting every
card on every keystroke is what makes the dev server feel like it's freezing.
Two features address this — one automatic, one a manual override.

### The render cache (on by default)

Every render is hashed by its **rendered SVG** — the exact bytes that would be
screenshotted, which reflects both your `data()` values *and* the template
file. On a `--watch`/`--serve` rebuild, if a card's hash matches what was last
written to that path (and the PNG still exists), the plugin **skips it
entirely** — no temp file, no browser tab. The browser is also launched
**lazily**, on the first card that actually needs re-rendering, so a rebuild
that touched only your content (not any card) never starts Chromium at all.

The cache lives in memory for the life of the Eleventy process, so it persists
across rebuilds but starts empty on each fresh `eleventy` run. It's on by
default; set `cache: false` to always render.

This is usually all you need: editing a blog post no longer re-renders its
card, and the freeze goes away.

### Turning cards off entirely (`enabled`)

The cache can't help the one case where you're **editing a card's own SVG or
its `data()`** — every save legitimately changes the hash and re-renders. When
you're iterating on the card design itself (or just don't want any card PNGs
during development), the `enabled` option is the hard off switch:

```js
eleventyConfig.addPlugin(socialCard, {
    template: 'src/card/social-card.svg',
    // Only render cards on a full build; never during --watch / --serve.
    enabled: ({ runMode }) => runMode === 'build',
    data(ctx) { /* … */ },
});
```

`runMode` is Eleventy's build mode: `'build'` for a one-off `eleventy` run,
`'watch'` for `--watch`, and `'serve'` for `--serve`. You can also pass a plain
boolean (`enabled: false`) or drive it from an env var
(`enabled: process.env.NODE_ENV === 'production'`).

When generation is disabled:

- The headless browser is **never launched** — no render work happens at all.
- `{% card %}` renders nothing (as usual).
- `{% card "emit" %}` still returns the card URL, so your `og:image` /
  `twitter:image` meta tags stay valid. The URL points at whatever PNG your
  last real build produced — if you've never run a full build, the image will
  404 in the dev preview. That's expected; run `eleventy` once (or with
  `enabled` on) to populate the cards.

## How it works

At `eleventy.before`, each template is read, parsed, and validated once with
[`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm). If a template
isn't well-formed XML, the build fails early with the parser's line and column.

Then, for each page that calls the shortcode:

1. Renders the SVG template with the variables returned by your `data()`.
2. Hashes the rendered SVG. If it matches the hash last written to this card's
   output path **and** that PNG still exists, the card is **skipped** (see
   [the render cache](#the-render-cache-on-by-default)) — steps 3–6 don't run.
3. Writes the SVG to a per-page temp file (`tmp-social-card-<filename>.svg`).
4. Opens the temp SVG in a headless Chromium page at the configured viewport.
5. Screenshots it to `outputDir/<filename>` and records the hash.
6. Deletes the temp SVG.
7. Returns the public URL (`urlPath + filename`).

Chromium is launched **lazily** — on the first card that actually needs
rendering — and closed at `eleventy.after`. A build (or watch rebuild) in which
every card is cached never starts the browser at all.

## Gotchas

**Same card for every post.** You're probably writing to a shared temp file.
This plugin uses a per-page temp file to avoid that; if you extend the plugin
or replace the `browser` factory, keep that invariant.

**Card is blank / shows `{{ title }}` verbatim.** The rendered SVG is invalid
XML. Usually an unescaped `&`, `<`, or `>` in a value. Keep `escape: true`
so the plugin handles interpolated values; the built-in `xmllint-wasm` check
will fail the build on the first page if the template itself is malformed.

**Fonts look wrong in CI but fine locally.** Chromium in CI only has whatever
fonts are installed on the runner. Install the fonts your SVG uses:

```yaml
- run: |
    mkdir -p ~/.local/share/fonts
    cp src/card/YourFont.otf ~/.local/share/fonts/
    fc-cache -f -v
```

**`this.ctx.environments` is empty.** You called the shortcode from a
template that isn't in the article's layout chain (e.g., a standalone
partial). Move the call into the layout that renders the post body.

## Development

Tests use [Vitest](https://vitest.dev/). They inject a fake browser through the
`browser` option, so the suite runs fast and needs no real Chromium.

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run coverage    # run with a coverage report (coverage/lcov.info)
```

CI runs the suite on every push and pull request and publishes coverage to
[Coveralls](https://coveralls.io/).

## License

Copyright (C) 2026 [Jakub T. Jankiewicz](https://jakub.jankiewicz.org)<br/>
Released under MIT license
