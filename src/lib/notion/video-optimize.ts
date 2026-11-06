/**
 * Videos uploaded to Notion are often camera/export masters (10 Mbps, 1080p+). The page shows them at most
 * 880px wide, so heavy ones are re-encoded once at sync time: H.264, ≤1600px wide, CRF 27, fast start.
 * A 39 MB 30 s clip becomes ~8 MB with no visible difference (user: the site felt sluggish).
 */
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { SiteData, Warning } from '../site-schema';

/** Files below this are already light (Instagram's own exports are ~1 MB). */
export const OPTIMIZE_OVER_BYTES = 3_000_000;
export const MAX_WIDTH = 1600;

/** Re-encodes `input` to `output` (mp4); returns false when no encoder is available or it failed. */
export type Encoder = (input: string, output: string) => boolean;

export const ffmpegEncoder: Encoder = (input, output) => {
  const r = spawnSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-i', input,
      '-vf', `scale='min(${MAX_WIDTH},iw)':-2`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      output,
    ],
    { stdio: 'inherit' },
  );
  return r.status === 0;
};

export function optimizeVideos(site: SiteData, dir: string, warn: (w: Warning) => void, encode: Encoder = ffmpegEncoder): SiteData {
  let saved = 0;
  for (const work of site.works) {
    for (const block of work.blocks) {
      if (block.type !== 'video' || !block.media.src.startsWith('/media/')) continue;
      const name = block.media.src.slice('/media/'.length);
      const input = join(dir, name);
      if (!existsSync(input)) continue;
      const before = statSync(input).size;
      if (before <= OPTIMIZE_OVER_BYTES) continue;
      const outName = name.replace(/\.[^.]+$/, '') + '.mp4';
      const tmp = join(dir, `${outName}.opt.mp4`);
      if (!encode(input, tmp) || !existsSync(tmp)) {
        warn({ code: 'video-optimize', message: `Could not re-encode ${name}; keeping the original.` });
        rmSync(tmp, { force: true });
        continue;
      }
      const after = statSync(tmp).size;
      if (after >= before) {
        rmSync(tmp, { force: true });
        continue;
      }
      if (outName !== name) rmSync(input, { force: true });
      renameSync(tmp, join(dir, outName));
      block.media.src = `/media/${outName}`;
      block.media.bytes = after;
      saved += before - after;
    }
  }
  if (saved) console.log(`Videos re-encoded: ${(saved / 1e6).toFixed(1)} MB lighter.`);
  return site;
}
