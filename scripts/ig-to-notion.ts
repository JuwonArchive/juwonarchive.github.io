/**
 * Instagram → Notion: posts land in the matching archive page, routed by hashtag
 * (#3d → 3D DESIGN, #ai → AI GENERATED, #graphic → 2D GRAPHIC, #touchdesigner → TOUCHDESIGNER).
 * Each post is appended to the end of its page as a new section: a divider and the post link (embed).
 * The regular Notion sync then turns it into images/video on the site.
 *
 * Two ways in (docs/INSTAGRAM.ko.md):
 *  B. INBOX (personal account, default): share a post to the "INBOX" page in Notion. Its hashtags are read
 *     from the post's public page; routed items leave the INBOX, untagged ones stay there.
 *  A. API (professional account): with IG_TOKEN set, new posts are read straight from Instagram.
 *
 *   npx tsx scripts/ig-to-notion.ts            run
 *   npx tsx scripts/ig-to-notion.ts --dry-run  only print what would happen
 *   npx tsx scripts/ig-to-notion.ts --refresh  renew the Instagram token (A only; written to $IG_TOKEN_OUT)
 *
 * Env: NOTION_TOKEN, NOTION_ROOT_PAGE_ID (optional), IG_TOKEN + IG_SINCE (A only).
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import notionPkg from '@notionhq/client';
import type { Client as NotionClient } from '@notionhq/client';
import { fetchSnapshot } from '../src/lib/notion/fetch';
import { mapSnapshot } from '../src/lib/notion/map';
import { captionFromEmbed, codesIn, plan, HASHTAG_ROUTES, type IgPost } from '../src/lib/ig-route';
import { processInbox } from '../src/lib/ig-inbox';
import { config } from '../src/config';

const { Client, collectPaginatedAPI, isFullBlock } = notionPkg;
const DEFAULT_ROOT = 'f30132cd-b7b4-4237-a40b-905086f79d6f';
const DEFAULT_SINCE = '2026-11-06T00:00:00Z'; // A: the day the automation was set up; older posts stay as they are
const GRAPH = process.env.IG_GRAPH_URL || 'https://graph.instagram.com'; // overridable for local tests
const INBOX_TITLE = 'INBOX';
const TAGS = Object.keys(HASHTAG_ROUTES).map((t) => `#${t}`).join(' ');

const dryRun = process.argv.includes('--dry-run');
const summary = (line: string) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
};

type Archive = { title: string; pageId: string };

async function appendPost(notion: NotionClient, pageId: string, url: string) {
  await notion.blocks.children.append({
    block_id: pageId,
    children: [
      { object: 'block', type: 'divider', divider: {} },
      { object: 'block', type: 'embed', embed: { url } },
    ],
  } as any);
}

// ---------- B. INBOX ----------

async function children(notion: NotionClient, id: string): Promise<any[]> {
  const items = await collectPaginatedAPI(notion.blocks.children.list, { block_id: id, page_size: 100 });
  return items.filter(isFullBlock);
}

/** A block with everything under it, sub-pages included (the Notion share button may save a sub-page). */
async function subtree(notion: NotionClient, block: any, depth = 0): Promise<any> {
  if (!block.has_children || depth > 3) return block;
  return { ...block, children: await Promise.all((await children(notion, block.id)).map((c) => subtree(notion, c, depth + 1))) };
}

async function findOrCreateInbox(notion: NotionClient, rootId: string, rootBlocks: any[]): Promise<string | null> {
  const found = rootBlocks.find((b) => b.type === 'child_page' && b.child_page?.title?.trim().toUpperCase() === INBOX_TITLE);
  if (found) return found.id;
  if (dryRun) return null;
  const page: any = await notion.pages.create({
    parent: { page_id: rootId },
    properties: { title: { title: [{ text: { content: INBOX_TITLE } }] } },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              text: {
                content: `인스타 게시물을 여기에 공유하세요. 1시간 안에 해시태그(${TAGS})를 보고 알맞은 아카이브로 옮겨요. 해시태그가 없는 게시물은 여기 남아요.`,
              },
            },
          ],
        },
      },
    ],
  } as any);
  summary(`Created the ${INBOX_TITLE} page in Notion.`);
  return page.id;
}

async function fetchCaption(url: string): Promise<string | null> {
  const res = await fetch(`${url}embed/captioned/`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; juwon-portfolio-sync/1.0)' } });
  if (!res.ok) return null;
  return captionFromEmbed(await res.text());
}

async function runInbox(notion: NotionClient, rootId: string, rootBlocks: any[], archives: Archive[], known: Set<string>) {
  const inboxId = await findOrCreateInbox(notion, rootId, rootBlocks);
  if (!inboxId) return summary(`No ${INBOX_TITLE} page yet.`);
  await processInbox(
    {
      items: () => children(notion, inboxId),
      subtree: (item) => subtree(notion, item),
      caption: fetchCaption,
      append: (pageId, url) => appendPost(notion, pageId, url),
      remove: async (id) => void (await notion.blocks.delete({ block_id: id })),
      log: summary,
    },
    archives,
    known,
    { dryRun, inbox: INBOX_TITLE },
  );
}

// ---------- A. Instagram API (professional accounts) ----------

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

async function runApi(notion: NotionClient, token: string, archives: Archive[], known: Set<string>) {
  const r = await graph('/v22.0/me/media?fields=id,caption,permalink,timestamp&limit=50', token);
  const posts: IgPost[] = (r.data ?? []).filter((p: any) => p.permalink && p.timestamp);
  const todo = plan(posts, archives, known, new Date(process.env.IG_SINCE || DEFAULT_SINCE));
  for (const item of todo.add) {
    summary(`- ${dryRun ? 'would add' : 'added'} → **${item.title}**: ${item.permalink}`);
    if (!dryRun) await appendPost(notion, item.pageId, item.permalink);
  }
  for (const p of todo.unsorted) summary(`- ⚠ not added (no ${TAGS}): ${p.permalink}`);
}

// ---------- main ----------

async function main() {
  const igToken = process.env.IG_TOKEN;
  if (process.argv.includes('--refresh')) {
    if (!igToken) return console.log('IG_TOKEN is not set — nothing to renew.');
    return refresh(igToken);
  }
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) throw new Error('NOTION_TOKEN is not set');
  const rootId = process.env.NOTION_ROOT_PAGE_ID || DEFAULT_ROOT;

  const snapshot = await fetchSnapshot(notionToken, rootId);
  const { site } = mapSnapshot(snapshot, { showPhone: config.showPhone, now: new Date() });
  const archives = snapshot.projects.map((p, i) => ({ title: site.works[i].titleEn, pageId: p.id }));
  const known = codesIn(snapshot.projects.map((p) => p.blocks));
  const notion = new Client({ auth: notionToken });

  summary(`### Instagram → Notion${dryRun ? ' (dry run)' : ''}`);
  await runInbox(notion, rootId, snapshot.rootBlocks, archives, known);
  if (igToken) await runApi(notion, igToken, archives, known);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
