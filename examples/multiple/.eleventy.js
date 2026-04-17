import socialCard from '../../src/index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function(eleventyConfig) {
    eleventyConfig.addPlugin(socialCard, {
        shortcode: 'card',
        cards: {
            article: {
                template: path.join(__dirname, 'cards/article.svg'),
                outputDir: path.join(__dirname, '_site/img/articles'),
                urlPath: '/img/articles',
                data(ctx) {
                    return {
                        title:  ctx.title ?? 'Untitled article',
                        author: ctx.author ?? 'Anonymous',
                        date:   new Date(ctx.date ?? Date.now()).toDateString(),
                    };
                },
            },
            pages: {
                template: path.join(__dirname, 'cards/page.svg'),
                outputDir: path.join(__dirname, '_site/img/pages'),
                urlPath: '/img/pages',
                data(ctx) {
                    return {
                        title: ctx.title ?? 'Untitled page',
                        site:  ctx.siteName ?? 'example.com',
                    };
                },
            },
        },
    });

    eleventyConfig.addCollection('articles', (api) =>
        api.getFilteredByGlob(__dirname + '/content/articles/*.md')
    );
    eleventyConfig.addCollection('pages', (api) =>
        api.getFilteredByGlob(__dirname + '/content/pages/*.md')
    );

    return {
        dir: {
            input: 'content',
            output: '_site',
            includes: '../_includes',
        },
    };
}
