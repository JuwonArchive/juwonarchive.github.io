import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/snapshot.json';
import { mapSnapshot, englishTitle, slugify, parseExperience } from '../../src/lib/notion/map';
import type { NotionSnapshot, NPage } from '../../src/lib/notion/types';

const snap = () => structuredClone(fixture) as unknown as NotionSnapshot;
const now = new Date('2026-11-03T00:00:00Z');
const run = (s = snap(), showPhone = false) => mapSnapshot(s, { showPhone, now });

describe('contact', () => {
  it('reads email, instagram and location and hides the phone by default', () => {
    const { contact } = run().site;
    expect(contact.email).toBe('juwon0824@naver.com');
    expect(contact.instagram).toEqual({ handle: '@baboyeonggaam', url: 'https://www.instagram.com/baboyeonggaam/' });
    expect(contact.location).toBe('ILSAN, Korea');
    expect(contact.phone).toBeUndefined();
  });
  it('includes the phone when showPhone is true', () => {
    expect(run(snap(), true).site.contact.phone).toBe('010-0000-0000');
  });
});

describe('experience', () => {
  it('sorts newest first', () => {
    const { experience } = run().site;
    expect(experience[0]).toMatchObject({ label: 'WNT Studio 그래픽 디자이너', period: '26.09~' });
    expect(experience[3]).toMatchObject({ label: 'GEMSHO 인턴', period: '24.09~24.11' });
    expect(experience.at(-1)?.label).toBe('강동고등학교');
  });
  it('keeps a line without a period and sorts it last', () => {
    expect(parseExperience('포트폴리오 준비중')).toEqual({ label: '포트폴리오 준비중', period: undefined, sortKey: -Infinity });
    const s = snap();
    const col = s.rootBlocks[0].children![0].children!;
    col.push({ id: 'x', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '포트폴리오 준비중' }] } });
    expect(run(s).site.experience.at(-1)?.label).toBe('포트폴리오 준비중');
  });
  it('normalises spaced periods', () => {
    expect(parseExperience('KNOWCK 일경험인턴 26.01 ~ 26.02')).toEqual({ label: 'KNOWCK 일경험인턴', period: '26.01 ~ 26.02', sortKey: 202601 });
    expect(parseExperience('강동고등학교 2016~2019').sortKey).toBe(201600);
  });
});

describe('skills', () => {
  it('groups by Type keeping row order', () => {
    const { skills } = run().site;
    expect(skills.software).toEqual(['Daz 3d', 'Cinema4D', 'Adobe Photoshop']);
    expect(skills.expertise).toEqual(['Team Management']);
    expect(skills.language).toEqual(['Korean', 'English']);
  });
});

describe('works', () => {
  it('uses English titles and slugs in Notion order', () => {
    const { works } = run().site;
    expect(works.map((w) => w.titleEn)).toEqual(['3D DESIGN', 'AI GENERATED', '2D GRAPHIC', 'TOUCHDESIGNER']);
    expect(works.map((w) => w.slug)).toEqual(['3d-design', 'ai-generated', '2d-graphic', 'touchdesigner']);
    expect(works[0].titleKo).toBe('3D 디자인');
    expect(works[0].tags).toEqual(['3D', 'cinema4d', '그래픽 디자인', 'Blender']);
    expect(works[0].link).toBe('https://www.instagram.com/baboyeonggaam/');
    expect(works[0].notionUrl).toBe('https://www.notion.so/3D-page-0024');
    expect(works[1].blocks[0]).toMatchObject({ type: 'paragraph' });
  });
  it('prefers the 영문 제목 override', () => {
    const s = snap();
    (s.projects[0] as NPage).properties['영문 제목'] = { type: 'rich_text', rich_text: [{ plain_text: 'Motion Works' }] };
    expect(run(s).site.works[0].titleEn).toBe('MOTION WORKS');
  });
  it('has a cover when Notion has one and none otherwise', () => {
    const { works } = run().site;
    expect(works[0].cover).toMatchObject({ kind: 'image', src: expect.stringContaining('casual_artwork.jpg') });
    expect(works[3].cover).toBeUndefined();
  });
  it('keeps duplicate titles on unique slugs', () => {
    const s = snap();
    for (const p of s.projects.slice(0, 2)) p.properties['영문 제목'] = { type: 'rich_text', rich_text: [{ plain_text: '3D' }] };
    expect(run(s).site.works.slice(0, 2).map((w) => w.slug)).toEqual(['3d', '3d-2']);
  });
  it('warns when a title needs a generated English name', () => {
    const s = snap();
    s.projects[0].properties['이름'] = { type: 'title', title: [{ plain_text: '새 작업' }] };
    const { site, warnings } = run(s);
    expect(site.works[0].titleEn).toBe('UNTITLED 01');
    expect(warnings.some((w) => w.code === 'missing-english-title')).toBe(true);
  });
  it('stamps generatedAt', () => {
    expect(run().site.generatedAt).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('englishTitle / slugify', () => {
  it('falls back to UNTITLED with index', () => {
    expect(englishTitle('새 작업', undefined, 4)).toEqual({ title: 'UNTITLED 05', warned: true });
  });
  it('keeps ASCII words from mixed titles', () => {
    expect(englishTitle('Blender 실험', undefined, 0)).toEqual({ title: 'BLENDER', warned: false });
  });
  it('slugifies and dedupes', () => {
    const taken = new Set<string>();
    expect(slugify('AI GENERATED', taken)).toBe('ai-generated');
    expect(slugify('AI GENERATED', taken)).toBe('ai-generated-2');
  });
});
