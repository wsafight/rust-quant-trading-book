import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://wsafight.github.io',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
