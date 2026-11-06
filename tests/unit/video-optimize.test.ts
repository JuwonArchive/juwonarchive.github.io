import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { optimizeVideos, OPTIMIZE_OVER_BYTES, type Encoder } from '../../src/lib/notion/video-optimize';
import type { SiteData, Warning } from '../../src/lib/site-schema';

let dir: string;
let warnings: Warning[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vid-'));
  warnings = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const video = (name: string, bytes: number) => {
  writeFileSync(join(dir, name), Buffer.alloc(bytes));
  return { type: 'video' as const, media: { id: name, src: `/media/${name}`, kind: 'video' as const, bytes } };
};
const siteWith = (...blocks: ReturnType<typeof video>[]): SiteData => ({
  generatedAt: '',
  contact: {},
  experience: [],
  skills: { software: [], expertise: [], language: [] },
  works: [{ slug: 'w', titleEn: 'W', titleKo: 'W', tags: [], blocks }],
});
/** Pretends to encode: writes a file of the given size. */
const fakeEncoder = (size: number): Encoder => (_in, out) => (writeFileSync(out, Buffer.alloc(size)), true);

describe('optimizeVideos (user: the site felt sluggish)', () => {
  it('re-encodes heavy videos to a light mp4 and records the new size', () => {
    const big = OPTIMIZE_OVER_BYTES * 4;
    const site = optimizeVideos(siteWith(video('big.mov', big)), dir, (w) => warnings.push(w), fakeEncoder(1000));
    const b = site.works[0].blocks[0] as ReturnType<typeof video>;
    expect(b.media.src).toBe('/media/big.mp4');
    expect(b.media.bytes).toBe(1000);
    expect(readdirSync(dir)).toEqual(['big.mp4']);
  });

  it('leaves light videos (e.g. Instagram exports) alone', () => {
    let called = false;
    const enc: Encoder = (i, o) => ((called = true), fakeEncoder(1)(i, o));
    optimizeVideos(siteWith(video('ig-A.mp4', 900_000)), dir, () => {}, enc);
    expect(called).toBe(false);
  });

  it('keeps the original when encoding fails or would not make it smaller', () => {
    const big = OPTIMIZE_OVER_BYTES + 10;
    const site = optimizeVideos(
      siteWith(video('a.mp4', big), video('b.mp4', big)),
      dir,
      (w) => warnings.push(w),
      (input, out) => (input.endsWith('a.mp4') ? false : fakeEncoder(big * 2)(input, out)),
    );
    expect(site.works[0].blocks.map((b) => (b as ReturnType<typeof video>).media.bytes)).toEqual([big, big]);
    expect(warnings.map((w) => w.code)).toEqual(['video-optimize']);
    expect(existsSync(join(dir, 'a.mp4')) && existsSync(join(dir, 'b.mp4'))).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['a.mp4', 'b.mp4']);
  });
});
