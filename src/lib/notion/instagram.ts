import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, SiteData, Warning } from '../site-schema';
import { MAX_BYTES, defaultIO, type IO } from './media';

export type InstagramMedia = { aspect?: number; isVideo?: boolean; videoUrl?: string; imageUrl?: string };
/** Top-level fields describe the first slide; a carousel also lists every slide. */
export type InstagramPost = InstagramMedia & { slides?: InstagramMedia[] };

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

function parseMedia(html: string): InstagramMedia {
  const post: InstagramMedia = {};
  const d = html.match(/\\?"dimensions\\?":\{\\?"height\\?":(\d+),\\?"width\\?":(\d+)\}/);
  if (d && Number(d[1]) > 0 && Number(d[2]) > 0) post.aspect = Number(d[2]) / Number(d[1]);
  if (/\\?"is_video\\?":true/.test(html)) post.isVideo = true;
  const video = jsonString(html, 'video_url');
  const image = jsonString(html, 'display_url');
  if (video) post.videoUrl = video;
  if (image) post.imageUrl = image;
  // Some embed pages carry no JSON at all, only the rendered <img>: take its largest srcset entry,
  // and its play-button sprite tells a video from a photo.
  if (!post.imageUrl) {
    const tag = html.match(/<img class="EmbeddedMediaImage"[^>]*>/)?.[0];
    if (tag) {
      const unescape = (u: string) => u.replace(/&amp;/g, '&');
      const srcset = tag.match(/srcset="([^"]*)"/)?.[1] ?? '';
      const best = [...srcset.matchAll(/(https:\/\/[^\s,]+)\s+(\d+)w/g)].sort((a, b) => Number(b[2]) - Number(a[2]))[0]?.[1];
      const src = best ?? tag.match(/\ssrc="([^"]*)"/)?.[1];
      if (src) post.imageUrl = unescape(src);
      if (/PlayButtonSprite/.test(html)) post.isVideo = true;
    }
  }
  return post;
}

export function parseInstagramPost(html: string): InstagramPost {
  const post: InstagramPost = parseMedia(html);
  // Carousel: every slide sits under edge_sidecar_to_children as {"node":{…}}.
  const start = html.search(/\\?"edge_sidecar_to_children\\?"/);
  if (start !== -1) {
    const end = html.slice(start).search(/\\?"edge_media_to_caption\\?"/);
    const section = html.slice(start, end === -1 ? undefined : start + end);
    const slides = section.split(/\{\\?"node\\?":\{/).slice(1).map(parseMedia);
    if (slides.length) post.slides = slides;
  }
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
      const base = `ig-${shortcode(block.url)}`;
      const items = post.slides && post.slides.length > 1 ? post.slides : [post];
      const replaced: Block[] = [];
      for (const [k, item] of items.entries()) {
        const id = items.length > 1 ? `${base}-${k + 1}` : base;
        try {
          const b = await toBlock(item, id, block.url, outDir, io);
          if (b) replaced.push(b);
          else if (items.length > 1) warn({ code: 'instagram-media', message: `Slide ${k + 1} of ${block.url} could not be shown; skipped.` });
        } catch (err) {
          warn({ code: 'instagram-media', message: `Could not download ${block.url}${items.length > 1 ? ` (slide ${k + 1})` : ''}: ${(err as Error).message}.` });
        }
      }
      if (replaced.length) {
        if (block.caption) (replaced[replaced.length - 1] as { caption?: typeof block.caption }).caption = block.caption;
        blocks.push(...replaced);
      } else {
        blocks.push(post.aspect ? { ...block, aspect: post.aspect } : block);
      }
    }
    work.blocks = blocks;
  }
  return out;
}

/**
 * One post or slide → a video, an image, or (video Instagram will not release, usually library music)
 * its cover with a play button to the post (user). A video that is merely too large returns nothing,
 * so a single post stays an embed, which still plays.
 */
async function toBlock(item: InstagramMedia, id: string, source: string, outDir: string, io: IgIO): Promise<Block | undefined> {
  if (item.videoUrl) {
    const raw = await io.download(item.videoUrl);
    if (raw.length <= MAX_BYTES) {
      writeFileSync(join(outDir, `${id}.mp4`), raw);
      return { type: 'video', media: { id, src: `/media/${id}.mp4`, kind: 'video', ...nominalSize(item.aspect), bytes: raw.length }, source };
    }
  }
  const withheld = item.isVideo && !item.videoUrl;
  if ((!item.isVideo || withheld) && item.imageUrl) {
    const img = await io.toWebp(await io.download(item.imageUrl));
    writeFileSync(join(outDir, `${id}.webp`), img.buf);
    const b: Block = { type: 'image', media: { id, src: `/media/${id}.webp`, kind: 'image', width: img.width, height: img.height }, source };
    if (withheld) b.playOn = 'instagram';
    return b;
  }
  return undefined;
}

/** Videos are stored with the post's aspect as nominal dimensions (exact pixels are not in the page). */
function nominalSize(aspect: number | undefined): { width?: number; height?: number } {
  if (!aspect) return {};
  return aspect >= 1 ? { width: 1280, height: Math.round(1280 / aspect) } : { width: Math.round(1280 * aspect), height: 1280 };
}
