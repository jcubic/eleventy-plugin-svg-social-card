import socialCard from '../src/index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function(eleventyConfig) {
    eleventyConfig.addPlugin(socialCard, {
        template: path.join(__dirname, 'card.svg'),
        outputDir: path.join(__dirname, '_site/img/social-cards'),
        urlPath: '/img/social-cards',
        data(ctx) {
            return {
                title:  ctx.title ?? 'Untitled',
                author: ctx.author ?? 'Anonymous',
                date:   new Date(ctx.date ?? Date.now()).toDateString(),
            };
        },
    });

    return {
        dir: {
            input: 'content',
            output: '_site',
            includes: '../_includes',
        },
    };
}
