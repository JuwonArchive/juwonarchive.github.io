import { describe, expect, it } from 'vitest';
import { codesIn, hashtags, plan, routeFor, shortcode, type IgPost } from '../../src/lib/ig-route';

const pages = [
  { title: '3D DESIGN', pageId: 'p3d' },
  { title: 'AI GENERATED', pageId: 'pai' },
  { title: '2D GRAPHIC', pageId: 'p2d' },
  { title: 'TOUCHDESIGNER', pageId: 'ptd' },
];
const post = (id: string, caption: string, timestamp = '2026-11-07T10:00:00+0000'): IgPost => ({
  id,
  caption,
  timestamp,
  permalink: `https://www.instagram.com/p/${id}/`,
});
const SINCE = new Date('2026-11-06T00:00:00Z');

describe('hashtags and routes (user: #3d #ai #graphic #touchdesigner)', () => {
  it('reads hashtags in order, lower-cased, Korean included', () => {
    expect(hashtags('새 작업 #3D #블렌더 #AI')).toEqual(['3d', '블렌더', 'ai']);
  });
  it('maps each tag to its archive', () => {
    expect(routeFor('render #3d')).toBe('3D DESIGN');
    expect(routeFor('#ai video')).toBe('AI GENERATED');
    expect(routeFor('poster #Graphic')).toBe('2D GRAPHIC');
    expect(routeFor('#touchdesigner live')).toBe('TOUCHDESIGNER');
  });
  it('the first matching tag wins; look-alike tags do not match', () => {
    expect(routeFor('#blender #ai #3d')).toBe('AI GENERATED');
    expect(routeFor('#3dart #aiart #graphicdesign')).toBeNull();
    expect(routeFor(undefined)).toBeNull();
  });
});

describe('post codes', () => {
  it('reads the code from post, reel and share URLs', () => {
    expect(shortcode('https://www.instagram.com/p/ABC123/')).toBe('ABC123');
    expect(shortcode('https://www.instagram.com/reel/Xy_9-z/?igsh=abc')).toBe('Xy_9-z');
    expect(shortcode('https://instagram.com/juwon/p/QQQ/')).toBe('QQQ');
    expect(shortcode('https://example.com/p/ABC/')).toBeNull();
  });
  it('finds every post already in a Notion block tree', () => {
    const blocks = [
      { type: 'embed', embed: { url: 'https://www.instagram.com/p/AAA/' } },
      { type: 'toggle', children: [{ type: 'bookmark', bookmark: { url: 'https://www.instagram.com/reel/BBB/?x=1' } }] },
    ];
    expect([...codesIn(blocks)].sort()).toEqual(['AAA', 'BBB']);
  });
});

describe('plan', () => {
  it('adds new tagged posts to their archive, oldest first', () => {
    const p = plan(
      [post('B', '#ai', '2026-11-08T00:00:00+0000'), post('A', '#3d', '2026-11-07T00:00:00+0000')],
      pages,
      new Set(),
      SINCE,
    );
    expect(p.add).toEqual([
      { pageId: 'p3d', title: '3D DESIGN', permalink: 'https://www.instagram.com/p/A/' },
      { pageId: 'pai', title: 'AI GENERATED', permalink: 'https://www.instagram.com/p/B/' },
    ]);
  });
  it('skips posts already in Notion, posts before the start date, and untagged posts', () => {
    const p = plan(
      [post('OLD', '#3d', '2026-10-01T00:00:00+0000'), post('KNOWN', '#3d'), post('NOTAG', 'hello #blender')],
      pages,
      new Set(['KNOWN']),
      SINCE,
    );
    expect(p.add).toEqual([]);
    expect(p.existing.map((x) => x.id)).toEqual(['KNOWN']);
    expect(p.unsorted.map((x) => x.id)).toEqual(['NOTAG']);
  });
  it('never adds the same post twice in one run', () => {
    const twice = post('DUP', '#3d');
    expect(plan([twice, { ...twice }], pages, new Set(), SINCE).add).toHaveLength(1);
  });
  it('a tag whose archive is missing in Notion is left unsorted', () => {
    expect(plan([post('T', '#touchdesigner')], pages.slice(0, 3), new Set(), SINCE).unsorted).toHaveLength(1);
  });
});
