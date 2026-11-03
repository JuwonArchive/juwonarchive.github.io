import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, SiteData, Warning } from '../site-schema';
import { MAX_BYTES, defaultIO, type IO } from './media';

export type InstagramPost = { aspect?: number; isVideo?: boolean; videoUrl?: string; imageUrl?: string };

/** The embed page embeds the post as escaped JSON (\"key\":\"value\", URLs written as https:\/\/…). */
function jsonString(html: string, key: string): string | undefined {
  const m = html.match(new RegExp(`\\\\?"${key}\\\\?":\\\\?"(.*?)\\\\?"`));
  if (!m) return undefined;
  return m[1]
    .replace(/\\+\//g, '/')
    .replace(/\\+u0026/g, '&')
    .replace(/\\+u003[cC]/g, '<')
    .replace(/\\+u003[eE]/g, '>');
}

export function parseInstagramPost(html: string): InstagramPost {
  const post: InstagramPost = {};
  const d = html.match(/\\?"dimensions\\?":\{\\?"height\\?":(\d+),\\?"width\\?":(\d+)\}/);
  if (d && Number(d[1]) > 0 && Number(d[2]) > 0) post.aspect = Number(d[2]) / Number(d[1]);
  if (/\\?"is_video\\?":true/.test(html)) post.isVideo = true;
  const video = jsonString(html, 'video_url');
  const image = jsonString(html, 'display_url');
  if (video) post.videoUrl = video;
  if (image) post.imageUrl = image;
  return post;
}

type IgIO = IO & { fetchHtml(url: string): Promise<string> };

const defaultIgIO: IgIO = {
  ...defaultIO,
  async fetchHtml(url) {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; juwon-portfolio-sync/1.0)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
};

const shortcode = (url: string) => url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/)?.[1] ?? 'post';

/**
 * Instagram posts are the user's own work: download the original video (or image) so the site
 * plays it at full resolution without Instagram's frame. If that is impossible, keep the embed and
 * record its aspect so the page can crop the embed to the post.
 */
export async function localizeInstagram(site: SiteData, outDir: string, warn: (w: Warning) => void, io: IgIO = defaultIgIO): Promise<SiteData> {
  mkdirSync(outDir, { recursive: true });
  const out: SiteData = structuredClone(site);
  for (const work of out.works) {
    const blocks: Block[] = [];
    for (const block of work.blocks) {
      if (block.type !== 'embed' || block.provider !== 'instagram') {
        blocks.push(block);
        continue;
      }
      let post: InstagramPost;
      try {
        post = parseInstagramPost(await io.fetchHtml(block.embedUrl.replace(/\/?$/, '/')));
      } catch (err) {
        warn({ code: 'instagram-fetch', message: `Could not read ${block.url}: ${(err as Error).message}; keeping the Instagram embed.` });
        blocks.push(block);
        continue;
      }
      const id = `ig-${shortcode(block.url)}`;
      let replaced: Block | undefined;
      try {
        if (post.videoUrl) {
          const raw = await io.download(post.videoUrl);
          if (raw.length <= MAX_BYTES) {
            writeFileSync(join(outDir, `${id}.mp4`), raw);
            const dims = nominalSize(post.aspect);
            replaced = { type: 'video', media: { id, src: `/media/${id}.mp4`, kind: 'video', ...dims, bytes: raw.length }, source: block.url };
          }
        }
        // A video must stay a video: only photo posts become images.
        if (!replaced && !post.isVideo && post.imageUrl) {
          const img = await io.toWebp(await io.download(post.imageUrl));
          writeFileSync(join(outDir, `${id}.webp`), img.buf);
          replaced = { type: 'image', media: { id, src: `/media/${id}.webp`, kind: 'image', width: img.width, height: img.height }, source: block.url };
        }
      } catch (err) {
        warn({ code: 'instagram-media', message: `Could not download ${block.url}: ${(err as Error).message}; keeping the Instagram embed.` });
      }
      if (replaced) {
        if (block.caption) (replaced as { caption?: typeof block.caption }).caption = block.caption;
        blocks.push(replaced);
      } else {
        blocks.push(post.aspect ? { ...block, aspect: post.aspect } : block);
      }
    }
    work.blocks = blocks;
  }
  return out;
}

/** Videos are stored with the post's aspect as nominal dimensions (exact pixels are not in the page). */
function nominalSize(aspect: number | undefined): { width?: number; height?: number } {
  if (!aspect) return {};
  return aspect >= 1 ? { width: 1280, height: Math.round(1280 / aspect) } : { width: Math.round(1280 * aspect), height: 1280 };
}
