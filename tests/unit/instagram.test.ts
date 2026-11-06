import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseInstagramPost, localizeInstagram } from '../../src/lib/notion/instagram';
import { MAX_BYTES } from '../../src/lib/notion/media';
import type { SiteData, Warning } from '../../src/lib/site-schema';

const esc = (u: string) => u.replaceAll('/', '\\\\/');
const page = (o: { w?: number; h?: number; video?: string; image?: string; isVideo?: boolean }) =>
  `<script>{\\"shortcode\\":\\"X\\"` +
  (o.w ? `,\\"dimensions\\":{\\"height\\":${o.h},\\"width\\":${o.w}}` : '') +
  (o.image ? `,\\"display_url\\":\\"${esc(o.image)}\\"` : '') +
  (o.video ? `,\\"video_url\\":\\"${esc(o.video)}\\"` : '') +
  (o.isVideo || o.video ? `,\\"is_video\\":true` : '') +
  `}</script>`;

describe('parseInstagramPost', () => {
  it('reads size, original video and image, unescaping URLs', () => {
    const p = parseInstagramPost(page({ w: 720, h: 1280, video: 'https://cdn.ig/v.mp4?a=1\\u0026b=2', image: 'https://cdn.ig/p.jpg' }));
    expect(p).toEqual({ aspect: 720 / 1280, isVideo: true, videoUrl: 'https://cdn.ig/v.mp4?a=1&b=2', imageUrl: 'https://cdn.ig/p.jpg' });
  });
  it('returns an empty object when nothing is there', () => {
    expect(parseInstagramPost('<html></html>')).toEqual({});
  });
});

const site = (): SiteData => ({
  generatedAt: '',
  contact: {},
  experience: [],
  skills: { software: [], expertise: [], language: [] },
  works: [
    {
      slug: 'w', titleEn: 'W', titleKo: 'W', tags: [],
      blocks: [
        { type: 'embed', provider: 'instagram', url: 'https://www.instagram.com/reel/AAA/', embedUrl: 'https://www.instagram.com/reel/AAA/embed' },
        { type: 'embed', provider: 'instagram', url: 'https://www.instagram.com/p/BBB/', embedUrl: 'https://www.instagram.com/p/BBB/embed' },
        { type: 'embed', provider: 'instagram', url: 'https://www.instagram.com/p/CCC/', embedUrl: 'https://www.instagram.com/p/CCC/embed' },
        { type: 'embed', provider: 'youtube', url: 'https://youtu.be/x', embedUrl: 'https://www.youtube.com/embed/x' },
      ],
    },
  ],
});

let dir: string;
let warnings: Warning[];
const warn = (w: Warning) => warnings.push(w);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ig-'));
  warnings = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const pages: Record<string, string> = {
  'https://www.instagram.com/reel/AAA/embed/': page({ w: 720, h: 1280, video: 'https://cdn.ig/a.mp4', image: 'https://cdn.ig/a.jpg' }),
  'https://www.instagram.com/p/BBB/embed/': page({ w: 1080, h: 1350, image: 'https://cdn.ig/b.jpg' }),
  'https://www.instagram.com/p/CCC/embed/': page({ w: 1080, h: 607 }),
  'https://www.instagram.com/reel/DDD/embed/': page({ w: 720, h: 1280, isVideo: true, image: 'https://cdn.ig/d.jpg' }),
};
const io = (sizes: Record<string, number> = {}) => ({
  async fetchHtml(url: string) {
    if (!(url in pages)) throw new Error('404');
    return pages[url];
  },
  async download(url: string) {
    return Buffer.alloc(sizes[url] ?? 10);
  },
  async toWebp() {
    return { buf: Buffer.from('w'), width: 1080, height: 1350 };
  },
});

describe('localizeInstagram', () => {
  it('replaces Instagram embeds with the original video or image, keeping a link to the post', async () => {
    const out = await localizeInstagram(site(), dir, warn, io());
    const [a, b, c, yt] = out.works[0].blocks;
    expect(a).toEqual({
      type: 'video',
      media: { id: 'ig-AAA', src: '/media/ig-AAA.mp4', kind: 'video', width: 720, height: 1280, bytes: 10 },
      source: 'https://www.instagram.com/reel/AAA/',
    });
    expect(b).toEqual({
      type: 'image',
      media: { id: 'ig-BBB', src: '/media/ig-BBB.webp', kind: 'image', width: 1080, height: 1350 },
      source: 'https://www.instagram.com/p/BBB/',
    });
    expect(readdirSync(dir).sort()).toEqual(['ig-AAA.mp4', 'ig-BBB.webp']);
    // No downloadable media: keep the embed, sized so the page can crop Instagram's frame away.
    expect(c).toMatchObject({ type: 'embed', provider: 'instagram', aspect: expect.closeTo(1080 / 607, 4) });
    expect(yt).toMatchObject({ type: 'embed', provider: 'youtube' });
  });

  it('keeps the embed and warns when Instagram cannot be read', async () => {
    const s = site();
    s.works[0].blocks[0] = { type: 'embed', provider: 'instagram', url: 'https://www.instagram.com/reel/ZZZ/', embedUrl: 'https://www.instagram.com/reel/ZZZ/embed' };
    const out = await localizeInstagram(s, dir, warn, io());
    expect(out.works[0].blocks[0]).toMatchObject({ type: 'embed', provider: 'instagram' });
    expect(warnings.map((w) => w.code)).toContain('instagram-fetch');
  });

  it('a video Instagram will not release (e.g. library music) becomes its cover with a play-on-Instagram button (user)', async () => {
    const s = site();
    s.works[0].blocks[0] = { type: 'embed', provider: 'instagram', url: 'https://www.instagram.com/reel/DDD/', embedUrl: 'https://www.instagram.com/reel/DDD/embed' };
    const out = await localizeInstagram(s, dir, warn, io());
    expect(out.works[0].blocks[0]).toEqual({
      type: 'image',
      media: { id: 'ig-DDD', src: '/media/ig-DDD.webp', kind: 'image', width: 1080, height: 1350 },
      source: 'https://www.instagram.com/reel/DDD/',
      playOn: 'instagram',
    });
  });

  it('keeps the embed when a video is too large to host', async () => {
    const out = await localizeInstagram(site(), dir, warn, io({ 'https://cdn.ig/a.mp4': MAX_BYTES + 1 }));
    expect(out.works[0].blocks[0]).toMatchObject({ type: 'embed', provider: 'instagram' });
  });
});
