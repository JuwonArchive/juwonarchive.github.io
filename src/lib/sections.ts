import type { Block } from './site-schema';
import { plainText } from './plain';

export type Section = { title?: string; blocks: Block[] };

const INTRO_TYPES = new Set<Block['type']>(['paragraph', 'list', 'quote']);

/**
 * Notion page → AREA-style depth: leading text becomes the folded "MORE INFO",
 * the rest is cut into sections at every divider. A heading that opens a section becomes its title.
 */
export function splitSections(blocks: Block[]): { intro: Block[]; sections: Section[] } {
  let i = 0;
  while (i < blocks.length && INTRO_TYPES.has(blocks[i].type)) i++;
  const intro = blocks.slice(0, i);

  const raw: Block[][] = [[]];
  for (const b of blocks.slice(i)) {
    if (b.type === 'divider') raw.push([]);
    else raw[raw.length - 1].push(b);
  }

  const sections: Section[] = [];
  for (const group of raw) {
    const first = group[0];
    const section: Section =
      first?.type === 'heading' ? { title: plainText(first.text), blocks: group.slice(1) } : { blocks: group };
    if (section.blocks.length) sections.push(section);
  }
  return { intro, sections };
}
