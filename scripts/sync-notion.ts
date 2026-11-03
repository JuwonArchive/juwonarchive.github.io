/**
 * npm run sync                       → fetch Notion, write src/data/site.json, public/media/*, public/sync-hash.txt
 * npm run sync -- --check <hashUrl>  → only report whether Notion changed since the deployed hash (changed=true|false)
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fetchSnapshot } from '../src/lib/notion/fetch';
import { publishedHash, snapshotHash } from '../src/lib/notion/hash';
import { mapSnapshot } from '../src/lib/notion/map';
import { localizeMedia } from '../src/lib/notion/media';
import { localizeInstagram } from '../src/lib/notion/instagram';
import { config } from '../src/config';
import type { Warning } from '../src/lib/site-schema';

const DEFAULT_ROOT = 'f30132cd-b7b4-4237-a40b-905086f79d6f';

async function deployedHash(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? (await res.text()).trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN is not set. See docs/SETUP.ko.md.');
    process.exit(1);
  }
  const root = process.env.NOTION_ROOT_PAGE_ID || DEFAULT_ROOT;
  const checkIdx = process.argv.indexOf('--check');

  const snapshot = await fetchSnapshot(token, root);
  const hash = snapshotHash(snapshot);

  if (checkIdx !== -1) {
    const url = process.argv[checkIdx + 1];
    const changed = !url || (await deployedHash(url)) !== hash;
    console.log(`changed=${changed}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    return;
  }

  const warnings: Warning[] = [];
  const warn = (w: Warning) => warnings.push(w);
  const { site, warnings: mapWarnings } = mapSnapshot(snapshot, { showPhone: config.showPhone, now: new Date() });
  warnings.push(...mapWarnings);

  // Download into a scratch folder and swap it in only after everything succeeded,
  // so a crash midway never leaves site.json pointing at deleted files.
  const TMP = 'public/media.tmp';
  rmSync(TMP, { recursive: true, force: true });
  const localized = await localizeInstagram(await localizeMedia(site, TMP, warn), TMP, warn);

  mkdirSync('src/data', { recursive: true });
  rmSync('public/media', { recursive: true, force: true });
  if (existsSync(TMP)) renameSync(TMP, 'public/media');
  writeFileSync('src/data/site.json', JSON.stringify(localized, null, 2));
  writeFileSync('public/sync-hash.txt', publishedHash(hash, warnings) + '\n');

  for (const w of warnings) console.warn(`⚠ [${w.code}] ${w.message}`);
  console.log(`Synced ${localized.works.length} works, ${localized.experience.length} experience items. hash=${hash.slice(0, 12)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
