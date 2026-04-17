# eleventy-plugin-svg-social-card

[![npm](https://img.shields.io/badge/npm-0.1.1-yellow.svg)](https://www.npmjs.com/package/eleventy-plugin-svg-social-card)
[![github repo](https://img.shields.io/badge/github-repo-orange?logo=github)](https://github.com/jcubic/eleventy-plugin-svg-social-card)
[![LICENSE MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/jcubic/eleventy-plugin-svg-social-card/blob/master/LICENSE)

Generate per-page social card images (Open Graph / Twitter card) for your
Eleventy site from an SVG template, rendered via a headless browser.

- Works with any layout engine Eleventy supports (Liquid, Nunjucks, JS…).
- One SVG template with `{{ placeholders }}`, one shortcode per page.
- Safe-by-default: XML-escapes every interpolated value.
- Unique per-page temp file — no race conditions when Eleventy builds in parallel.
- Returns the public URL of the generated image, so you can drop it straight
  into your `<head>`.

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
{% capture cardUrl %}{% card %}{% endcapture %}
<article>
  <h1>{{ title }}</h1>
  {{ content }}
</article>
```

In Liquid, shortcodes are tags (not variables), so you need `{% capture %}` to
stash the returned URL into a variable. In Nunjucks it's just
`{% set cardUrl = card() %}`.

In your `<head>`:

```liquid
{% if cardUrl %}
<meta property="og:image"        content="{{ site.url }}{{ cardUrl }}" />
<meta property="og:image:width"  content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:image"       content="{{ site.url }}{{ cardUrl }}" />
{% endif %}
```

The shortcode returns the image URL, so you can pass it around like any other
value.

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
{% capture cardUrl %}{% card "article" %}{% endcapture %}
```

In your page layout:

```liquid
{% capture cardUrl %}{% card "pages" %}{% endcapture %}
```

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
| `cards`      | `object` (see below)           | `null`                         | If present, register a multi-variant shortcode — each key is a card name, each value is a variant-scoped options object. Ignores top-level `template`/`data`/`outputDir`/etc. when set. |
| `outputDir`  | `string`                       | `'_site/img/social-cards'`     | Where to write the PNG. |
| `urlPath`    | `string`                       | `'/img/social-cards'`          | Public URL prefix (what the shortcode returns). |
| `filename`   | `(page) => string`             | ``page => `${page.fileSlug}.png` `` | Output filename. |
| `viewport`   | `{width, height}`              | `{1200, 630}`                  | Browser viewport for the screenshot. |
| `delay`      | `number` (ms)                  | `100`                          | Pause after page load, so fonts settle. |
| `escape`     | `boolean`                      | `true`                         | Auto XML-escape all values returned by `data()`. Disable if you need to inject raw markup. |
| `browser`    | `async () => Browser`          | `null`                         | Optional factory for a custom Puppeteer `Browser` instance. Default launches with `headless: 'new'` and `--no-sandbox`. |

## Only show the meta tag for pages that actually have a card

If your `<head>` is shared across article and non-article pages, guard the
meta tag with a tag check on the frontmatter — no collection needed:

```liquid
{% if tags contains 'post' %}
  {% capture cardUrl %}{% card %}{% endcapture %}
  <meta property="og:image" content="{{ site.url }}{{ cardUrl }}" />
{% else %}
  <meta property="og:image" content="{{ site.url }}/img/default-card.png" />
{% endif %}
```

That's it. Non-article pages skip the whole block — the shortcode never
runs for them, so no stray PNGs get generated.

In Nunjucks: `{% if "post" in tags %}` / `{% set cardUrl = card() %}`.

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
  {% capture cardUrl %}{% card %}{% endcapture %}
  <meta property="og:image" content="{{ site.url }}{{ cardUrl }}" />
{% endif %}
```

## How it works

For each page that calls the shortcode:

1. Renders the SVG template with the variables returned by your `data()`.
2. On the first render of the build, parses the rendered XML with
   [`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm). If it's not
   well-formed, throws — the Eleventy build fails with the parser's line
   and column. Subsequent renders skip this check.
3. Writes the SVG to a per-page temp file (`tmp-social-card-<filename>.svg`).
4. Opens the temp SVG in a headless Chromium page at the configured viewport.
5. Screenshots it to `outputDir/<filename>`.
6. Deletes the temp SVG.
7. Returns the public URL (`urlPath + filename`).

A single Chromium instance is launched at `eleventy.before` and closed at
`eleventy.after`, so you pay the startup cost once per build, not per page.

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

## License

Copyright (C) 2026 [Jakub T. Jankiewicz](https://jakub.jankiewicz.org)<br/>
Released under MIT license
