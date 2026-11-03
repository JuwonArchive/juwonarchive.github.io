import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SiteData } from '../lib/site-schema';

// Resolved from the project root: import.meta.url points into dist/ once Astro bundles this file.
const SITE_JSON = join(process.cwd(), 'src/data/site.json');

let cached: SiteData | undefined;

export function loadSite(): SiteData {
  if (cached) return cached;
  if (!existsSync(SITE_JSON)) throw new Error('src/data/site.json not found — run `npm run sync` first');
  cached = JSON.parse(readFileSync(SITE_JSON, 'utf8')) as SiteData;
  return cached;
}
