# eleventy-plugin-svg-social-card

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
npx playwright install --with-deps chromium
```

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
{% assign cardUrl = socialCard %}
<article>
  <h1>{{ title }}</h1>
  {{ content }}
</article>
```

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

## Options

| Option       | Type                           | Default                        | Description |
| ------------ | ------------------------------ | ------------------------------ | ----------- |
| `template`   | `string` **(required)**        | —                              | Path to the `.svg` template. |
| `data`       | `function` **(required)**      | —                              | `(ctx, page) => {...}`. Returns the variables for the SVG. `ctx` is the page's template data; `page` is Eleventy's `page` object. |
| `shortcode`  | `string`                       | `'socialCard'`                 | Shortcode name. |
| `outputDir`  | `string`                       | `'_site/img/social-cards'`     | Where to write the PNG. |
| `urlPath`    | `string`                       | `'/img/social-cards'`          | Public URL prefix (what the shortcode returns). |
| `filename`   | `(page) => string`             | ``page => `${page.fileSlug}.png` `` | Output filename. |
| `viewport`   | `{width, height}`              | `{1200, 630}`                  | Browser viewport for the screenshot. |
| `delay`      | `number` (ms)                  | `100`                          | Pause after page load, so fonts settle. |
| `escape`     | `boolean`                      | `true`                         | Auto XML-escape all values returned by `data()`. Disable if you need to inject raw markup. |
| `browser`    | `async () => Browser`          | `null`                         | Optional factory for a custom Playwright `Browser` instance. Default launches `chromium` with `--no-sandbox`. |

## Only show the meta tag for pages that actually have a card

If your `<head>` is shared across article and non-article pages, guard the
meta tag. The cleanest way is with an Eleventy collection:

```js
eleventyConfig.addCollection('articles', (api) =>
    api.getAll().filter(item =>
        (item.data.tags ?? []).includes('post')
    )
);
```

```liquid
{%- assign match    = collections.articles | where: "url", page.url -%}
{%- assign hasCard  = match.size > 0 -%}

{%- if hasCard %}
<meta property="og:image" content="{{ site.url }}{{ cardUrl }}" />
{%- else %}
<meta property="og:image" content="{{ site.url }}/img/default-card.png" />
{%- endif %}
```

## CI validation

Invalid XML in the SVG template (unclosed tag, unescaped `&`) will silently
render broken cards. Validate the template early in your build:

```yaml
# .github/workflows/build.yaml
- name: Validate social card template
  run: |
    node --input-type=module -e "
      import('eleventy-plugin-svg-social-card/validate').then(async ({ validateSvgTemplate }) => {
        await validateSvgTemplate('src/card/social-card.svg', {
          title:  'Test &amp; title',
          author: 'Author &lt;with&gt; chars',
          date:   '1 Jan 2026',
        });
        console.log('SVG template OK');
      }).catch(e => { console.error('::error::' + e.message); process.exit(1); });
    "
```

`validateSvgTemplate` renders the template with your sample vars and parses
the result with [`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm)
— a WASM build of libxml2's `xmllint`, so no `apt-get` / system `libxml2`
needed. Throws on invalid XML; the error's `.errors` array has the raw
parser messages.

## How it works

For each page that calls the shortcode:

1. Renders the SVG template with the variables returned by your `data()`.
2. Writes it to a per-page temp file (`tmp-social-card-<filename>.svg`).
3. Opens the temp SVG in a headless Chromium page at the configured viewport.
4. Screenshots it to `outputDir/<filename>`.
5. Deletes the temp SVG.
6. Returns the public URL (`urlPath + filename`).

A single Chromium instance is launched at `eleventy.before` and closed at
`eleventy.after`, so you pay the startup cost once per build, not per page.

## Gotchas

**Same card for every post.** You're probably writing to a shared temp file.
This plugin uses a per-page temp file to avoid that; if you extend the plugin
or replace the `browser` factory, keep that invariant.

**Card is blank / shows `{{ title }}` verbatim.** The rendered SVG is invalid
XML. Usually an unescaped `&`, `<`, or `>` in a value. Keep `escape: true`,
or run `validateSvgTemplate()` in CI.

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

MIT © Jakub T. Jankiewicz
