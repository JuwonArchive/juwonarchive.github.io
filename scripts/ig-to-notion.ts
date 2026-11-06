/**
 * Instagram → Notion: new posts land in the matching archive page, routed by hashtag
 * (#3d → 3D DESIGN, #ai → AI GENERATED, #graphic → 2D GRAPHIC, #touchdesigner → TOUCHDESIGNER).
 * Each post is appended to the end of its page as a new section: a divider and the post link (embed).
 * The regular Notion sync then turns it into images/video on the site.
 *
 *   npx tsx scripts/ig-to-notion.ts            add new posts
 *   npx tsx scripts/ig-to-notion.ts --dry-run  only print what would be added
 *   npx tsx scripts/ig-to-notion.ts --refresh  renew the Instagram token (written to $IG_TOKEN_OUT)
 *
 * Env: IG_TOKEN (Instagram API with Instagram Login, long-lived token), NOTION_TOKEN,
 *      IG_SINCE (ISO date; older posts are never added), NOTION_ROOT_PAGE_ID (optional).
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import notionPkg from '@notionhq/client';
import { fetchSnapshot } from '../src/lib/notion/fetch';
import { mapSnapshot } from '../src/lib/notion/map';
import { codesIn, plan, HASHTAG_ROUTES, type IgPost } from '../src/lib/ig-route';
import { config } from '../src/config';

const { Client } = notionPkg;
const DEFAULT_ROOT = 'f30132cd-b7b4-4237-a40b-905086f79d6f';
const DEFAULT_SINCE = '2026-11-06T00:00:00Z'; // the day the automation was set up: older posts stay as they are
const GRAPH = process.env.IG_GRAPH_URL || 'https://graph.instagram.com'; // overridable for local tests

const summary = (line: string) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
};

async function graph(path: string, token: string): Promise<any> {
  const url = new URL(path, GRAPH);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  // Never print the URL: it carries the token.
  if (!res.ok) throw new Error(`Instagram API ${res.status}: ${body?.error?.message ?? 'request failed'}`);
  return body;
}

async function refresh(token: string) {
  const out = process.env.IG_TOKEN_OUT;
  if (!out) throw new Error('IG_TOKEN_OUT is not set');
  const r = await graph('/refresh_access_token?grant_type=ig_refresh_token', token);
  if (!r.access_token) throw new Error('Instagram returned no token');
  console.log(`::add-mask::${r.access_token}`);
  writeFileSync(out, r.access_token);
  console.log(`Instagram token renewed; valid for ${Math.round((r.expires_in ?? 0) / 86400)} more days.`);
}

async function recentPosts(token: string): Promise<IgPost[]> {
  const r = await graph('/v22.0/me/media?fields=id,caption,permalink,timestamp&limit=50', token);
  return (r.data ?? []).filter((p: any) => p.permalink && p.timestamp);
}

async function main() {
  const igToken = process.env.IG_TOKEN;
  if (!igToken) {
    console.log('IG_TOKEN is not set — Instagram automation is off. See docs/INSTAGRAM.ko.md.');
    return;
  }
  if (process.argv.includes('--refresh')) return refresh(igToken);

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) throw new Error('NOTION_TOKEN is not set');
  const since = new Date(process.env.IG_SINCE || DEFAULT_SINCE);
  const dryRun = process.argv.includes('--dry-run');

  const posts = await recentPosts(igToken);
  const snapshot = await fetchSnapshot(notionToken, process.env.NOTION_ROOT_PAGE_ID || DEFAULT_ROOT);
  const { site } = mapSnapshot(snapshot, { showPhone: config.showPhone, now: new Date() });
  const pages = snapshot.projects.map((p, i) => ({ title: site.works[i].titleEn, pageId: p.id }));
  const known = codesIn([snapshot.rootBlocks, snapshot.projects.map((p) => p.blocks)]);
  const todo = plan(posts, pages, known, since);

  summary(`### Instagram → Notion`);
  summary(`Checked ${posts.length} recent posts (since ${since.toISOString().slice(0, 10)}).`);
  const notion = new Client({ auth: notionToken });
  for (const item of todo.add) {
    summary(`- ${dryRun ? 'would add' : 'added'} → **${item.title}**: ${item.permalink}`);
    if (dryRun) continue;
    await notion.blocks.children.append({
      block_id: item.pageId,
      children: [
        { object: 'block', type: 'divider', divider: {} },
        { object: 'block', type: 'embed', embed: { url: item.permalink } },
      ],
    } as any);
  }
  const tags = Object.keys(HASHTAG_ROUTES).map((t) => `#${t}`).join(' ');
  for (const p of todo.unsorted) summary(`- ⚠ not added (no ${tags}): ${p.permalink}`);
  if (!todo.add.length && !todo.unsorted.length) summary('Nothing new.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
