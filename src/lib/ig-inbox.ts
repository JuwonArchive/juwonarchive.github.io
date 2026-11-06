/** INBOX → archives: the decision logic behind scripts/ig-to-notion.ts, with Notion and Instagram injected. */
import { postUrlsIn, routeFor, HASHTAG_ROUTES } from './ig-route';

export type InboxDeps = {
  /** Top-level blocks of the INBOX page. */
  items(): Promise<{ id: string }[]>;
  /** The item with everything under it (sub-pages included). */
  subtree(item: { id: string }): Promise<unknown>;
  /** Caption of a public post, or null when it cannot be read. */
  caption(url: string): Promise<string | null>;
  append(pageId: string, url: string): Promise<void>;
  remove(blockId: string): Promise<void>;
  log(line: string): void;
};

export type InboxResult = { moved: { title: string; url: string }[]; left: string[]; removed: string[] };

export async function processInbox(
  deps: InboxDeps,
  archives: { title: string; pageId: string }[],
  known: Set<string>,
  { dryRun = false, inbox = 'INBOX' } = {},
): Promise<InboxResult> {
  const tags = Object.keys(HASHTAG_ROUTES).map((t) => `#${t}`).join(' ');
  const byTitle = new Map(archives.map((a) => [a.title.trim().toUpperCase(), a]));
  const result: InboxResult = { moved: [], left: [], removed: [] };

  for (const item of await deps.items()) {
    const posts = postUrlsIn(await deps.subtree(item));
    if (!posts.size) continue; // the instructions paragraph, notes, …
    let allDone = true;
    for (const [code, url] of posts) {
      if (known.has(code)) {
        deps.log(`- already in the archive, removed from ${inbox}: ${url}`);
        continue;
      }
      const caption = await deps.caption(url).catch(() => null);
      if (caption === null) {
        deps.log(`- ⚠ could not read the post (private or deleted?), left in ${inbox}: ${url}`);
        result.left.push(url);
        allDone = false;
        continue;
      }
      const title = routeFor(caption);
      const archive = title ? byTitle.get(title.toUpperCase()) : undefined;
      if (!archive) {
        deps.log(`- ⚠ no ${tags}, left in ${inbox}: ${url}`);
        result.left.push(url);
        allDone = false;
        continue;
      }
      deps.log(`- ${dryRun ? 'would move' : 'moved'} → **${archive.title}**: ${url}`);
      if (!dryRun) await deps.append(archive.pageId, url);
      result.moved.push({ title: archive.title, url });
      known.add(code);
    }
    if (allDone) {
      if (!dryRun) await deps.remove(item.id);
      result.removed.push(item.id);
    }
  }
  if (!result.moved.length && !result.left.length && !result.removed.length) deps.log(`${inbox}: nothing new.`);
  return result;
}
