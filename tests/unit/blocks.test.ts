import { describe, it, expect, vi } from 'vitest';
import { toBlocks, toEmbed } from '../../src/lib/notion/blocks';
import { toRichText, plain } from '../../src/lib/notion/richtext';
import type { NBlock } from '../../src/lib/notion/types';

const rt = (content: string, extra: Record<string, unknown> = {}) => [
  { type: 'text', plain_text: content, text: { content, link: null }, annotations: { bold: false, italic: false, code: false }, href: null, ...extra },
];
const b = (id: string, type: string, payload: Record<string, unknown> = {}, children?: NBlock[]): NBlock => ({
  id,
  type,
  [type]: payload,
  ...(children ? { children, has_children: true } : {}),
});
const noWarn = () => {};

describe('toRichText', () => {
  it('keeps links and bold', () => {
    const out = toRichText([
      {
        type: 'text',
        plain_text: 'site',
        text: { content: 'site', link: { url: 'https://example.com' } },
        annotations: { bold: true, italic: false, code: false },
        href: 'https://example.com',
      },
    ]);
    expect(out).toEqual([{ text: 'site', href: 'https://example.com', bold: true }]);
    expect(plain(out)).toBe('site');
  });
});

describe('toBlocks', () => {
  it('maps headings to levels', () => {
    const out = toBlocks(
      [b('h1', 'heading_1', { rich_text: rt('A') }), b('h2', 'heading_2', { rich_text: rt('B') }), b('h3', 'heading_3', { rich_text: rt('작업물') })],
      noWarn,
    );
    expect(out.map((x) => x.type === 'heading' && x.level)).toEqual([1, 2, 3]);
  });

  it('merges consecutive list items into one list', () => {
    const out = toBlocks(
      [
        b('l1', 'bulleted_list_item', { rich_text: rt('a') }),
        b('l2', 'bulleted_list_item', { rich_text: rt('b') }),
        b('l3', 'bulleted_list_item', { rich_text: rt('c') }),
        b('n1', 'numbered_list_item', { rich_text: rt('one') }),
      ],
      noWarn,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: 'list', ordered: false });
    expect(out[0].type === 'list' && out[0].items).toHaveLength(3);
    expect(out[1]).toMatchObject({ type: 'list', ordered: true });
  });

  it('maps uploaded and external images', () => {
    const out = toBlocks(
      [
        b('img-1', 'image', { type: 'file', file: { url: 'https://s3.example/a.png?sig=1' }, caption: [] }),
        b('img-2', 'image', { type: 'external', external: { url: 'https://cdn.example/b.jpg' }, caption: rt('cap') }),
      ],
      noWarn,
    );
    expect(out[0]).toEqual({ type: 'image', media: { id: 'img-1', src: 'https://s3.example/a.png?sig=1', kind: 'image' } });
    expect(out[1]).toMatchObject({ type: 'image', media: { id: 'img-2', src: 'https://cdn.example/b.jpg' }, caption: [{ text: 'cap' }] });
  });

  it('turns external YouTube videos into embeds and uploaded videos into video blocks', () => {
    const out = toBlocks(
      [
        b('v1', 'video', { type: 'external', external: { url: 'https://www.youtube.com/watch?v=abc123' }, caption: [] }),
        b('v2', 'video', { type: 'file', file: { url: 'https://s3.example/clip.mp4?sig=2' }, caption: [] }),
      ],
      noWarn,
    );
    expect(out[0]).toMatchObject({ type: 'embed', provider: 'youtube', embedUrl: 'https://www.youtube.com/embed/abc123' });
    expect(out[1]).toMatchObject({ type: 'video', media: { id: 'v2', kind: 'video' } });
  });

  it('flattens column_list, column and synced_block children in order', () => {
    const out = toBlocks(
      [
        b('cl', 'column_list', {}, [
          b('c1', 'column', {}, [b('p1', 'paragraph', { rich_text: rt('left') })]),
          b('c2', 'column', {}, [b('sb', 'synced_block', {}, [b('p2', 'paragraph', { rich_text: rt('right') })])]),
        ]),
      ],
      noWarn,
    );
    expect(out.map((x) => x.type === 'paragraph' && plain(x.text))).toEqual(['left', 'right']);
  });

  it('skips unknown block types with one warning', () => {
    const warn = vi.fn();
    const out = toBlocks([b('t', 'table_of_contents', {}), b('p', 'paragraph', { rich_text: rt('ok') })], warn);
    expect(out).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0].code).toBe('unknown-block');
  });

  it('drops empty paragraphs used as spacers', () => {
    expect(toBlocks([b('p', 'paragraph', { rich_text: [] })], noWarn)).toEqual([]);
  });

  it('maps embeds and dividers', () => {
    const out = toBlocks(
      [b('e', 'embed', { url: 'https://vimeo.com/76979871', caption: [] }), b('d', 'divider', {}), b('p', 'paragraph', { rich_text: rt('after') })],
      noWarn,
    );
    expect(out[0]).toMatchObject({ type: 'embed', provider: 'vimeo', url: 'https://vimeo.com/76979871' });
    expect(out[1]).toEqual({ type: 'divider' });
  });
});

describe('toEmbed', () => {
  it('handles youtube, vimeo, instagram and unknown urls', () => {
    expect(toEmbed('https://youtu.be/abc123')).toEqual({ provider: 'youtube', embedUrl: 'https://www.youtube.com/embed/abc123' });
    expect(toEmbed('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', embedUrl: 'https://player.vimeo.com/video/76979871' });
    expect(toEmbed('https://www.instagram.com/p/XYZ/')).toEqual({ provider: 'instagram', embedUrl: 'https://www.instagram.com/p/XYZ/embed' });
    expect(toEmbed('https://example.com/x')).toEqual({ provider: 'other', embedUrl: 'https://example.com/x' });
  });
});

describe('toBlocks divider cleanup', () => {
  it('collapses repeated dividers and trims them at the edges', () => {
    const p = (id: string, t: string) => b(id, 'paragraph', { rich_text: rt(t) });
    const out = toBlocks(
      [b('d0', 'divider'), p('a', 'A'), b('d1', 'divider'), b('d2', 'divider'), b('d3', 'divider'), p('c', 'C'), b('d4', 'divider'), b('e', 'paragraph', { rich_text: [] })],
      noWarn,
    );
    expect(out.map((x) => x.type)).toEqual(['paragraph', 'divider', 'paragraph']);
  });
});

describe('toBlocks unknown sites', () => {
  it('turns bookmarks/embeds of ordinary sites into link buttons, not iframes', () => {
    const out = toBlocks([b('bm', 'bookmark', { url: 'https://www.example.com/post', caption: [] })], noWarn);
    expect(out).toEqual([{ type: 'fallback-link', url: 'https://www.example.com/post', label: 'OPEN EXAMPLE.COM' }]);
  });
  it('survives malformed URLs', () => {
    const out = toBlocks([b('bad', 'embed', { url: 'not a url', caption: [] })], noWarn);
    expect(out).toEqual([{ type: 'fallback-link', url: 'not a url', label: 'OPEN LINK' }]);
  });
});
