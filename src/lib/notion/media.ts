import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Block, Media, SiteData, Warning } from '../site-schema';

/** GitHub Pages rejects files over 100 MB; keep a margin. */
export const MAX_BYTES = 99_614_720;
/** 2× the 1280px frame. Height is only capped by WebP's limit, so tall detail-page images keep their width. */
const MAX_WIDTH = 2560;
const MAX_WEBP_SIDE = 16383;

export type IO = {
  download(url: string): Promise<Buffer>;
  toWebp(buf: Buffer): Promise<{ buf: Buffer; width: number; height: number }>;
};

export const defaultIO: IO = {
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
};

export function mediaPath(m: Media, ext: string): string {
  return `/media/${m.id}.${ext}`;
}

function videoExt(src: string): string {
  const ext = new URL(src).pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
  return ext ?? 'mp4';
}

type Result = { media: Media } | { tooLarge: true } | { failed: true };

async function localizeOne(m: Media, outDir: string, io: IO, warn: (w: Warning) => void): Promise<Result> {
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
      const r = await localizeOne(block.media, outDir, io, warn);
      if ('media' in r) blocks.push({ ...block, media: r.media });
      else if ('tooLarge' in r) blocks.push({ type: 'fallback-link', url: work.notionUrl ?? work.link ?? '#', label: 'VIEW ON NOTION' });
    }
    work.blocks = blocks;
  }
  return out;
}
