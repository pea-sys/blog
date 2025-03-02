import rss, { pagesGlobToRssItems } from '@astrojs/rss';

export async function GET(context) {
  return rss({
    title: 'Continuing daily | ブログ',
    description: '日々の積み重ねを記録するブログ',
    site: context.site,
    items: await pagesGlobToRssItems(import.meta.glob('./**/*.md')),
  });
}