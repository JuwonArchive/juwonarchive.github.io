import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  // Earlier URLs keep working after the depth restructure (spec §11).
  redirects: {
    '/works': '/archive',
    '/works/[slug]': '/archive/[slug]',
    '/about': '/info',
  },
});
