import fs from 'node:fs/promises';
import { Liquid } from 'liquidjs';
import { validateXML } from 'xmllint-wasm';

const liquid = new Liquid();

/**
 * Render the SVG template with the given sample variables and verify
 * the output is well-formed XML using xmllint-wasm (no system deps).
 *
 * Throws on invalid XML. The thrown error's `.errors` property contains
 * the raw xmllint error list.
 *
 * @param {string} templatePath  - path to the .svg template
 * @param {object} sampleVars    - variables to inject during rendering
 * @returns {Promise<{valid: true, rendered: string}>}
 */
export async function validateSvgTemplate(templatePath, sampleVars = {}) {
    const src = await fs.readFile(templatePath, 'utf8');
    const tmpl = liquid.parse(src);
    const rendered = await liquid.render(tmpl, sampleVars);

    const result = await validateXML({
        xml: rendered,
        normalization: 'format',
    });

    if (!result.valid) {
        const firstErr = result.errors[0]?.message ?? 'unknown parser error';
        const err = new Error(
            `SVG template renders invalid XML: ${templatePath}\n  ${firstErr}`
        );
        err.errors = result.errors;
        err.rendered = rendered;
        throw err;
    }

    return { valid: true, rendered };
}
