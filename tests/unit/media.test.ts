import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localizeMedia, mediaPath, MAX_BYTES } from '../../src/lib/notion/media';
import type { SiteData, Warning } from '../../src/lib/site-schema';

const site = (blocks: SiteData['works'][number]['blocks'], cover?: SiteData['works'][number]['cover']): SiteData => ({
  generatedAt: '2026-11-03T00:00:00.000Z',
  contact: {},
  experience: [],
  skills: { software: [], expertise: [], language: [] },
  works: [{ slug: 'w', titleEn: 'W', titleKo: 'W', tags: [], notionUrl: 'https://www.notion.so/W-abc', blocks, ...(cover ? { cover } : {}) }],
});

let dir: string;
let warnings: Warning[];
const warn = (w: Warning) => warnings.push(w);
const io = (sizes: Record<string, number> = {}, fail: string[] = []) => ({
  async download(url: string) {
    if (fail.some((f) => url.includes(f))) throw new Error('boom');
    const key = Object.keys(sizes).find((k) => url.includes(k));
    return Buffer.alloc(key ? sizes[key] : 10);
  },
  async toWebp(_buf: Buffer) {
    return { buf: Buffer.from('webp'), width: 2400, height: 1600 };
  },
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'media-'));
  warnings = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('mediaPath', () => {
  it('is deterministic from id and extension', () => {
    expect(mediaPath({ id: 'abc', src: 'x', kind: 'image' }, 'webp')).toBe('/media/abc.webp');
  });
});

describe('localizeMedia', () => {
  it('converts images to local webp with dimensions', async () => {
    const out = await localizeMedia(site([{ type: 'image', media: { id: 'img1', src: 'https://s3/a.png?sig=1', kind: 'image' } }]), dir, warn, io());
    expect(out.works[0].blocks[0]).toMatchObject({ type: 'image', media: { src: '/media/img1.webp', width: 2400, height: 1600 } });
    expect(readdirSync(dir)).toContain('img1.webp');
  });
  it('copies videos as-is keeping the extension', async () => {
    const out = await localizeMedia(site([{ type: 'video', media: { id: 'v1', src: 'https://s3/clip.mov?sig=1', kind: 'video' } }]), dir, warn, io({ 'clip.mov': 1000 }));
    expect(out.works[0].blocks[0]).toMatchObject({ type: 'video', media: { src: '/media/v1.mov', bytes: 1000 } });
  });
  it('replaces files over the size limit with a link to Notion', async () => {
    const out = await localizeMedia(
      site([{ type: 'video', media: { id: 'big', src: 'https://s3/big.mp4?sig=1', kind: 'video' } }]),
      dir,
      warn,
      io({ 'big.mp4': MAX_BYTES + 1 }),
    );
    expect(out.works[0].blocks[0]).toEqual({ type: 'fallback-link', url: 'https://www.notion.so/W-abc', label: 'VIEW ON NOTION' });
    expect(warnings.map((w) => w.code)).toEqual(['media-too-large']);
    expect(readdirSync(dir)).not.toContain('big.mp4');
  });
  it('drops a block whose download fails and warns', async () => {
    const out = await localizeMedia(
      site([
        { type: 'image', media: { id: 'bad', src: 'https://s3/bad.png', kind: 'image' } },
        { type: 'divider' },
      ]),
      dir,
      warn,
      io({}, ['bad.png']),
    );
    expect(out.works[0].blocks).toEqual([{ type: 'divider' }]);
    expect(warnings.map((w) => w.code)).toEqual(['media-failed']);
  });
  it('localizes covers and drops a failed cover', async () => {
    const ok = await localizeMedia(site([], { id: 'c1', src: 'https://s3/c.jpg', kind: 'image' }), dir, warn, io());
    expect(ok.works[0].cover?.src).toBe('/media/c1.webp');
    const bad = await localizeMedia(site([], { id: 'c2', src: 'https://s3/bad.jpg', kind: 'image' }), dir, warn, io({}, ['bad.jpg']));
    expect(bad.works[0].cover).toBeUndefined();
  });
});

describe('defaultIO.toWebp', () => {
  it('keeps tall images (detail pages) at full width instead of shrinking by the long edge', async () => {
    const { defaultIO } = await import('../../src/lib/notion/media');
    const sharp = (await import('sharp')).default;
    const tall = await sharp({ create: { width: 1000, height: 8000, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await defaultIO.toWebp(tall);
    expect(out.width).toBe(1000);
    expect(out.height).toBe(8000);
  });
  it('caps very wide images at 2560px wide', async () => {
    const { defaultIO } = await import('../../src/lib/notion/media');
    const sharp = (await import('sharp')).default;
    const wide = await sharp({ create: { width: 5120, height: 2880, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await defaultIO.toWebp(wide);
    expect(out.width).toBe(2560);
    expect(out.height).toBe(1440);
  });
});
