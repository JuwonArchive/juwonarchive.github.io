import { describe, it, expect } from 'vitest';
import { splitSections } from '../../src/lib/sections';
import type { Block } from '../../src/lib/site-schema';

const p = (t: string): Block => ({ type: 'paragraph', text: [{ text: t }] });
const h = (t: string): Block => ({ type: 'heading', level: 3, text: [{ text: t }] });
const img = (id: string): Block => ({ type: 'image', media: { id, src: `/media/${id}.webp`, kind: 'image' } });
const hr: Block = { type: 'divider' };

describe('splitSections', () => {
  it('uses text before the first media as the intro and splits the rest at dividers', () => {
    const out = splitSections([p('about'), p('more'), img('a'), p('cap a'), hr, img('b'), hr, h('개인작업'), img('c')]);
    expect(out.intro).toEqual([p('about'), p('more')]);
    expect(out.sections).toEqual([
      { blocks: [img('a'), p('cap a')] },
      { blocks: [img('b')] },
      { title: '개인작업', blocks: [img('c')] },
    ]);
  });

  it('has no intro when the page starts with media or a divider', () => {
    expect(splitSections([img('a'), p('x')]).intro).toEqual([]);
    expect(splitSections([hr, p('x'), img('a')]).intro).toEqual([]);
  });

  it('keeps a heading at the very top as the first section title, not intro', () => {
    const out = splitSections([h('작업물'), hr, img('a')]);
    expect(out.intro).toEqual([]);
    expect(out.sections).toEqual([{ blocks: [img('a')] }]);
  });

  it('drops sections that only hold a heading or nothing', () => {
    const out = splitSections([img('a'), hr, hr, h('빈 섹션'), hr]);
    expect(out.sections).toEqual([{ blocks: [img('a')] }]);
  });

  it('returns no sections for a page with only text', () => {
    const out = splitSections([p('only text')]);
    expect(out).toEqual({ intro: [p('only text')], sections: [] });
  });
});
