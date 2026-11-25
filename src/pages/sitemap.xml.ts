import type { APIRoute } from 'astro';
import { CURRICULUM } from '../data/curriculum';
import { RUST_CURRICULUM } from '../data/rustCurriculum';
import { withBase } from '../lib/url';

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://wsafight.github.io');
  const paths = [
    '/',
    '/rust',
    ...CURRICULUM.map((lesson) => `/lessons/${lesson.slug}`),
    ...RUST_CURRICULUM.map((chapter) => `/rust/${chapter.slug}`),
  ];

  const urls = paths
    .map((path) => {
      const loc = new URL(withBase(path), origin).toString();
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
