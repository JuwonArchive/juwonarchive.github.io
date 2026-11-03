import { config } from '../../config';
import type { ExperienceItem, Media, SiteData, Warning, Work } from '../site-schema';
import { toBlocks } from './blocks';
import { plain, toRichText } from './richtext';
import type { NBlock, NotionSnapshot, NPage } from './types';

const PERIOD_RE = /\s*((\d{4}|\d{2})(?:\.(\d{2}))?\s*~\s*(?:(?:\d{4}|\d{2})(?:\.\d{2})?)?)\s*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{1,2}-\d{3,4}-\d{4}$/;

export function parseExperience(line: string): ExperienceItem {
  const text = line.trim();
  const m = text.match(PERIOD_RE);
  if (!m || m.index === undefined || m.index === 0) return { label: text, period: undefined, sortKey: -Infinity };
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  const month = m[3] ? Number(m[3]) : 0;
  return { label: text.slice(0, m.index).trim(), period: m[1].trim(), sortKey: year * 100 + month };
}

export function englishTitle(titleKo: string, override: string | undefined, index: number): { title: string; warned: boolean } {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();
  if (override?.trim()) return { title: clean(override), warned: false };
  const mapped = config.categoryNames[titleKo.trim()];
  if (mapped) return { title: mapped, warned: false };
  const ascii = clean(titleKo.replace(/[^A-Za-z0-9 ]+/g, ' '));
  if (ascii) return { title: ascii, warned: false };
  return { title: `UNTITLED ${String(index + 1).padStart(2, '0')}`, warned: true };
}

export function slugify(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'work';
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

/** Depth-first list of blocks, looking through layout containers. */
function flatten(blocks: NBlock[]): NBlock[] {
  return blocks.flatMap((b) => (['column_list', 'column'].includes(b.type) ? flatten(b.children ?? []) : [b]));
}

function blockText(b: NBlock): string {
  if (b.type === 'child_page') return b.child_page?.title ?? '';
  return plain(toRichText(b[b.type]?.rich_text));
}

function readRoot(rootBlocks: NBlock[], showPhone: boolean) {
  const contact: SiteData['contact'] = {};
  const experience: ExperienceItem[] = [];
  let section: 'contact' | 'experience' | null = null;

  for (const b of flatten(rootBlocks)) {
    if (/^heading_/.test(b.type)) {
      const t = blockText(b);
      section = /contact/i.test(t) ? 'contact' : /education|employment/i.test(t) ? 'experience' : null;
      continue;
    }
    if (b.type === 'divider' || b.type === 'child_database') {
      section = null;
      continue;
    }
    const text = blockText(b).trim();
    if (!text) continue;
    if (section === 'contact' && ['child_page', 'paragraph', 'bulleted_list_item'].includes(b.type)) {
      if (EMAIL_RE.test(text)) contact.email = text;
      else if (PHONE_RE.test(text)) {
        if (showPhone) contact.phone = text;
      } else if (text.startsWith('@')) contact.instagram = { handle: text, url: `https://www.instagram.com/${text.slice(1)}/` };
      else contact.location = text;
    } else if (section === 'experience' && ['bulleted_list_item', 'numbered_list_item', 'paragraph'].includes(b.type)) {
      experience.push(parseExperience(text));
    }
  }
  // Stable sort keeps Notion order for equal keys.
  experience.sort((a, b) => (b.sortKey === a.sortKey ? 0 : b.sortKey > a.sortKey ? 1 : -1));
  return { contact, experience };
}

function prop(page: NPage, name: string): any {
  return page.properties[name];
}

function titleOf(page: NPage): string {
  const p = Object.values(page.properties).find((v: any) => v?.type === 'title');
  return plain(toRichText(p?.title)).trim();
}

function coverOf(page: NPage): Media | undefined {
  const f = prop(page, '커버')?.files?.[0];
  const src = f?.file?.url ?? f?.external?.url;
  return src ? { id: `${page.id}-cover`, src, kind: 'image' } : undefined;
}

function readSkills(rows: NPage[]): SiteData['skills'] {
  const skills: SiteData['skills'] = { software: [], expertise: [], language: [] };
  for (const row of rows) {
    const type = String(prop(row, 'Type')?.select?.name ?? '').toLowerCase() as keyof SiteData['skills'];
    const name = titleOf(row);
    if (name && type in skills) skills[type].push(name);
  }
  return skills;
}

export function mapSnapshot(s: NotionSnapshot, opts: { showPhone: boolean; now: Date }): { site: SiteData; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const warn = (w: Warning) => warnings.push(w);
  const { contact, experience } = readRoot(s.rootBlocks, opts.showPhone);
  const taken = new Set<string>();

  const works: Work[] = s.projects.map((page, i) => {
    const titleKo = titleOf(page);
    const override = plain(toRichText(prop(page, '영문 제목')?.rich_text));
    const { title, warned } = englishTitle(titleKo, override, i);
    if (warned) warn({ code: 'missing-english-title', message: `"${titleKo}" has no English title — fill in 영문 제목 in Notion.` });
    const work: Work = {
      slug: slugify(title, taken),
      titleEn: title,
      titleKo,
      tags: (prop(page, '태그')?.multi_select ?? []).map((t: any) => t.name),
      blocks: toBlocks(page.blocks, warn),
    };
    const cover = coverOf(page);
    if (cover) work.cover = cover;
    const link = prop(page, '관련 링크')?.url;
    if (link) work.link = link;
    if (page.url) work.notionUrl = page.url;
    return work;
  });

  return {
    site: { generatedAt: opts.now.toISOString(), contact, experience, skills: readSkills(s.skills), works },
    warnings,
  };
}
