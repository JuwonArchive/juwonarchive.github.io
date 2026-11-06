import { describe, expect, it } from 'vitest';
import { processInbox, type InboxDeps } from '../../src/lib/ig-inbox';

const archives = [
  { title: '3D DESIGN', pageId: 'p3d' },
  { title: 'AI GENERATED', pageId: 'pai' },
  { title: '2D GRAPHIC', pageId: 'p2d' },
  { title: 'TOUCHDESIGNER', pageId: 'ptd' },
];

function fakeNotion(inbox: Record<string, unknown>, captions: Record<string, string | null>) {
  const appended: [string, string][] = [];
  const removed: string[] = [];
  const deps: InboxDeps = {
    items: async () => Object.keys(inbox).map((id) => ({ id })),
    subtree: async (item) => inbox[item.id],
    caption: async (url) => {
      const code = url.match(/\/(?:p|reel)\/([\w-]+)\//)![1];
      if (!(code in captions)) throw new Error('network');
      return captions[code];
    },
    append: async (pageId, url) => void appended.push([pageId, url]),
    remove: async (id) => void removed.push(id),
    log: () => {},
  };
  return { deps, appended, removed };
}

describe('INBOX → archives (user: share posts to the Notion INBOX)', () => {
  it('moves tagged posts to their archive and clears them from the INBOX', async () => {
    const { deps, appended, removed } = fakeNotion(
      {
        note: { type: 'paragraph', text: '인스타 게시물을 여기에 공유하세요' },
        b1: { type: 'bookmark', bookmark: { url: 'https://www.instagram.com/reel/AAA/?igsh=1' } },
        page: { type: 'child_page', children: [{ type: 'bookmark', bookmark: { url: 'https://instagram.com/p/BBB/' } }] },
      },
      { AAA: 'corridor #c4d #3d', BBB: 'video #ai' },
    );
    const r = await processInbox(deps, archives, new Set());
    expect(appended).toEqual([
      ['p3d', 'https://www.instagram.com/reel/AAA/'],
      ['pai', 'https://www.instagram.com/p/BBB/'],
    ]);
    expect(removed).toEqual(['b1', 'page']); // the instructions note stays
    expect(r.left).toEqual([]);
  });

  it('leaves untagged, private or unreadable posts in the INBOX', async () => {
    const { deps, appended, removed } = fakeNotion(
      {
        untagged: { url: 'https://www.instagram.com/p/NOTAG/' },
        privatePost: { url: 'https://www.instagram.com/p/PRIV/' },
        offline: { url: 'https://www.instagram.com/p/DOWN/' },
      },
      { NOTAG: 'hello #blender', PRIV: null },
    );
    const r = await processInbox(deps, archives, new Set());
    expect(appended).toEqual([]);
    expect(removed).toEqual([]);
    expect(r.left).toHaveLength(3);
  });

  it('does not add a post twice: already archived ones are just cleared', async () => {
    const { deps, appended, removed } = fakeNotion(
      { dup1: { url: 'https://www.instagram.com/p/OLD/' }, x: { url: 'https://www.instagram.com/p/NEW/' }, y: { url: 'https://www.instagram.com/p/NEW/' } },
      { NEW: '#graphic' },
    );
    await processInbox(deps, archives, new Set(['OLD']));
    expect(appended).toEqual([['p2d', 'https://www.instagram.com/p/NEW/']]);
    expect(removed).toEqual(['dup1', 'x', 'y']);
  });

  it('dry run changes nothing', async () => {
    const { deps, appended, removed } = fakeNotion({ a: { url: 'https://www.instagram.com/p/T/' } }, { T: '#touchdesigner' });
    const r = await processInbox(deps, archives, new Set(), { dryRun: true });
    expect(r.moved).toEqual([{ title: 'TOUCHDESIGNER', url: 'https://www.instagram.com/p/T/' }]);
    expect(appended).toEqual([]);
    expect(removed).toEqual([]);
  });
});
