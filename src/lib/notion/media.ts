import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Block, Media, SiteData, Warning } from '../site-schema';

/** GitHub Pages rejects files over 100 MB; keep a margin. */
export const MAX_BYTES = 99_614_720;
/** 2× the 880px media frame. Height is only capped by WebP's limit, so tall detail-page images keep their width. */
const MAX_WIDTH = 1760;
const MAX_WEBP_SIDE = 16383;
/** Tall images are cut into pieces this tall: each loads and decodes only near the screen (user: heavy on phones). */
export const TILE_HEIGHT = 2400;
/** Neighbouring pieces overlap by this much, hidden by a negative margin, so no hairline seam shows. */
export const TILE_OVERLAP = 2;

export type Tiles = { width: number; height: number; tiles: { buf: Buffer; height: number }[] };

export type IO = {
  download(url: string): Promise<Buffer>;
  toWebp(buf: Buffer): Promise<{ buf: Buffer; width: number; height: number }>;
  /** Content images: like toWebp, but tall ones come back as pieces. Optional so simple fakes still work. */
  toWebpTiles?(buf: Buffer): Promise<Tiles>;
};

export const defaultIO: IO & { toWebpTiles(buf: Buffer): Promise<Tiles> } = {
  async download(url) {
    // Some file hosts reject requests without a user agent.
    const res = await fetch(url, { headers: { 'user-agent': 'juwon-portfolio-sync/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
  async toWebp(buf) {
    const { data, info } = await sharp(buf, { animated: true })
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_WEBP_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buf: data, width: info.width, height: info.pageHeight ?? info.height };
  },
  async toWebpTiles(buf) {
    const meta = await sharp(buf).metadata();
    // Animations stay whole.
    if ((meta.pages ?? 1) > 1) {
      const one = await defaultIO.toWebp(buf);
      return { width: one.width, height: one.height, tiles: [{ buf: one.buf, height: one.height }] };
    }
    const { data, info } = await sharp(buf, { limitInputPixels: false })
      .rotate()
      .resize({ width: MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const tiles: Tiles['tiles'] = [];
    for (let top = 0; top < height; top += TILE_HEIGHT) {
      const h = Math.min(TILE_HEIGHT + TILE_OVERLAP, height - top);
      const piece = await sharp(data, { raw: { width, height, channels } })
        .extract({ left: 0, top, width, height: h })
        .webp({ quality: 82 })
        .toBuffer();
      tiles.push({ buf: piece, height: h });
    }
    return { width, height, tiles };
  },
};

export function mediaPath(m: Media, ext: string): string {
  return `/media/${m.id}.${ext}`;
}

function videoExt(src: string): string {
  const ext = new URL(src).pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
  return ext ?? 'mp4';
}

type Result = { media: Media } | { tooLarge: true } | { failed: true };

async function localizeOne(m: Media, outDir: string, io: IO, warn: (w: Warning) => void, tiled = false): Promise<Result> {
  try {
    const raw = await io.download(m.src);
    if (m.kind === 'video') {
      if (raw.length > MAX_BYTES) {
        warn({ code: 'media-too-large', message: `Video ${m.id} is ${(raw.length / 1e6).toFixed(0)} MB — linked to Notion instead.` });
        return { tooLarge: true };
      }
      const path = mediaPath(m, videoExt(m.src));
      writeFileSync(join(outDir, path.split('/').pop()!), raw);
      return { media: { id: m.id, kind: 'video', src: path, bytes: raw.length } };
    }
    if (tiled && io.toWebpTiles) {
      const t = await io.toWebpTiles(raw);
      if (t.tiles.length > 1) {
        const tiles = t.tiles.map((tile, i) => {
          const path = `/media/${m.id}-${i + 1}.webp`;
          writeFileSync(join(outDir, path.split('/').pop()!), tile.buf);
          return { src: path, height: tile.height };
        });
        return { media: { id: m.id, kind: 'image', src: tiles[0].src, width: t.width, height: t.height, tiles } };
      }
      const path = mediaPath(m, 'webp');
      writeFileSync(join(outDir, path.split('/').pop()!), t.tiles[0].buf);
      return { media: { id: m.id, kind: 'image', src: path, width: t.width, height: t.height } };
    }
    const img = await io.toWebp(raw);
    const path = mediaPath(m, 'webp');
    writeFileSync(join(outDir, path.split('/').pop()!), img.buf);
    return { media: { id: m.id, kind: 'image', src: path, width: img.width, height: img.height } };
  } catch (err) {
    warn({ code: 'media-failed', message: `Could not fetch ${m.kind} ${m.id}: ${(err as Error).message}` });
    return { failed: true };
  }
}

export async function localizeMedia(site: SiteData, outDir: string, warn: (w: Warning) => void, io: IO = defaultIO): Promise<SiteData> {
  mkdirSync(outDir, { recursive: true });
  const out: SiteData = structuredClone(site);
  for (const work of out.works) {
    if (work.cover) {
      const r = await localizeOne(work.cover, outDir, io, warn);
      if ('media' in r) work.cover = r.media;
      else delete work.cover;
    }
    const blocks: Block[] = [];
    for (const block of work.blocks) {
      if (block.type !== 'image' && block.type !== 'video') {
        blocks.push(block);
        continue;
      }
      const r = await localizeOne(block.media, outDir, io, warn, true);
      if ('media' in r) blocks.push({ ...block, media: r.media });
      else if ('tooLarge' in r) blocks.push({ type: 'fallback-link', url: work.notionUrl ?? work.link ?? '#', label: 'VIEW ON NOTION' });
    }
    work.blocks = blocks;
  }
  return out;
}
