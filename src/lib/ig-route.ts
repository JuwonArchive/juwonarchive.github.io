/** Instagram → Notion routing: which archive a new post belongs to, decided by its hashtags. */

/** Hashtag (lower-case, without #) → archive English title (the 영문 제목 in Notion). */
export const HASHTAG_ROUTES: Record<string, string> = {
  '3d': '3D DESIGN',
  ai: 'AI GENERATED',
  graphic: '2D GRAPHIC',
  touchdesigner: 'TOUCHDESIGNER',
};

export type IgPost = { id: string; permalink: string; caption?: string; timestamp: string };
export type ArchivePage = { title: string; pageId: string };
export type Plan = {
  add: { pageId: string; title: string; permalink: string }[];
  /** Posts with none of the routing hashtags. */
  unsorted: IgPost[];
  /** Posts already somewhere in Notion. */
  existing: IgPost[];
};

/** Hashtags in the order they appear, lower-cased. Works for Korean tags too. */
export function hashtags(caption = ''): string[] {
  return [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase());
}

/** The archive for a caption: the first hashtag that has a route wins. */
export function routeFor(caption: string | undefined, routes = HASHTAG_ROUTES): string | null {
  for (const tag of hashtags(caption)) if (tag in routes) return routes[tag];
  return null;
}

/** Instagram post code from any post/reel URL ("…/p/CODE/", "…/reel/CODE/?igsh=…"). */
export function shortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i)?.[1] ?? null;
}

/** Every Instagram post code mentioned anywhere in a (JSON-serialisable) Notion block tree. */
export function codesIn(blocks: unknown): Set<string> {
  const text = JSON.stringify(blocks ?? []);
  const out = new Set<string>();
  for (const m of text.matchAll(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/gi)) out.add(m[1]);
  return out;
}

/**
 * Decide what to add: posts newer than `since`, oldest first, not already in Notion,
 * routed by hashtag to an archive page that exists.
 */
export function plan(posts: IgPost[], pages: ArchivePage[], known: Set<string>, since: Date, routes = HASHTAG_ROUTES): Plan {
  const byTitle = new Map(pages.map((p) => [p.title.trim().toUpperCase(), p]));
  const result: Plan = { add: [], unsorted: [], existing: [] };
  const fresh = posts
    .filter((p) => new Date(p.timestamp) >= since)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const post of fresh) {
    const code = shortcode(post.permalink);
    if (code && known.has(code)) {
      result.existing.push(post);
      continue;
    }
    const title = routeFor(post.caption, routes);
    const page = title ? byTitle.get(title.toUpperCase()) : undefined;
    if (!page) {
      result.unsorted.push(post);
      continue;
    }
    result.add.push({ pageId: page.pageId, title: page.title, permalink: post.permalink });
    if (code) known.add(code);
  }
  return result;
}

/** Caption text of a post from its public "embed/captioned" page (hashtags included), or null. */
export function captionFromEmbed(html: string): string | null {
  const start = html.indexOf('class="Caption"');
  if (start === -1) return null;
  const end = html.indexOf('</div>', start);
  const inner = html.slice(html.indexOf('>', start) + 1, end === -1 ? undefined : end);
  return inner
    .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** Instagram post URLs in a (JSON-serialisable) Notion subtree, one clean URL per post code. */
export function postUrlsIn(tree: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const text = JSON.stringify(tree ?? []);
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/gi)) {
    const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
    if (!out.has(m[2])) out.set(m[2], `https://www.instagram.com/${kind}/${m[2]}/`);
  }
  return out;
}

/**
 * Posts handed in directly ("Run workflow" → ig_add): one per line or ';', each "URL" or "URL => TAB".
 * Without a tab, the hashtags decide as usual.
 */
export function parseAddList(text = ''): { url: string; code: string; title?: string }[] {
  const out: { url: string; code: string; title?: string }[] = [];
  for (const entry of text.split(/[;\n]+/)) {
    const [left, right] = entry.split('=>').map((x) => x.trim());
    const found = [...postUrlsIn([left ?? ''])][0];
    if (!found) continue;
    const [code, url] = found;
    out.push(right ? { url, code, title: right.toUpperCase() } : { url, code });
  }
  return out;
}
