import type { Block, EmbedProvider, RichText, Warning } from '../site-schema';
import type { NBlock } from './types';
import { plain, toRichText } from './richtext';

const TRANSPARENT = new Set(['column_list', 'column', 'synced_block']);
const HEADINGS: Record<string, 1 | 2 | 3> = { heading_1: 1, heading_2: 2, heading_3: 3 };

export function toEmbed(url: string): { provider: EmbedProvider; embedUrl: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { provider: 'other', embedUrl: url };
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${u.pathname.slice(1)}` };
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (id) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.match(/^\/(\d+)/)?.[1];
    if (id) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` };
  }
  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|tv)\/([^/]+)/);
    if (m) return { provider: 'instagram', embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/embed` };
  }
  return { provider: 'other', embedUrl: url };
}

/** Embeddable players stay iframes; any other site becomes a link button (most sites refuse framing). */
function embedOrLink(url: string, extra: { caption?: RichText }): Block {
  const e = toEmbed(url);
  if (e.provider !== 'other') return { type: 'embed', url, ...e, ...extra };
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toUpperCase();
  } catch {
    /* malformed URL: generic label */
  }
  return { type: 'fallback-link', url, label: host ? `OPEN ${host}` : 'OPEN LINK' };
}

function fileUrl(payload: any): string | undefined {
  return payload?.type === 'external' ? payload.external?.url : payload?.file?.url ?? payload?.external?.url;
}

function caption(payload: any): { caption?: RichText } {
  const c = toRichText(payload?.caption);
  return plain(c).trim() ? { caption: c } : {};
}

/** Notion pages use stacks of dividers as spacing; keep at most one between content and none at the edges. */
function tidyDividers(blocks: Block[]): Block[] {
  const out = blocks.filter((b, i) => !(b.type === 'divider' && blocks[i - 1]?.type === 'divider'));
  while (out[0]?.type === 'divider') out.shift();
  while (out.at(-1)?.type === 'divider') out.pop();
  return out;
}

export function toBlocks(nodes: NBlock[], warn: (w: Warning) => void): Block[] {
  return tidyDividers(convert(nodes, warn));
}

function convert(nodes: NBlock[], warn: (w: Warning) => void): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const p = node[node.type];
    if (TRANSPARENT.has(node.type)) {
      out.push(...convert(node.children ?? [], warn));
      continue;
    }
    if (node.type in HEADINGS) {
      out.push({ type: 'heading', level: HEADINGS[node.type], text: toRichText(p?.rich_text) });
      continue;
    }
    switch (node.type) {
      case 'paragraph': {
        const text = toRichText(p?.rich_text);
        if (plain(text).trim()) out.push({ type: 'paragraph', text });
        break;
      }
      case 'quote':
      case 'callout': {
        const text = toRichText(p?.rich_text);
        if (plain(text).trim()) out.push({ type: 'quote', text });
        break;
      }
      case 'bulleted_list_item':
      case 'numbered_list_item': {
        const ordered = node.type === 'numbered_list_item';
        const last = out[out.length - 1];
        const item = toRichText(p?.rich_text);
        if (last?.type === 'list' && last.ordered === ordered) last.items.push(item);
        else out.push({ type: 'list', ordered, items: [item] });
        break;
      }
      case 'divider':
        out.push({ type: 'divider' });
        break;
      case 'image': {
        const src = fileUrl(p);
        if (src) out.push({ type: 'image', media: { id: node.id, src, kind: 'image' }, ...caption(p) });
        break;
      }
      case 'video': {
        const src = fileUrl(p);
        if (!src) break;
        if (p?.type === 'external') out.push(embedOrLink(src, caption(p)));
        else out.push({ type: 'video', media: { id: node.id, src, kind: 'video' }, ...caption(p) });
        break;
      }
      case 'embed':
      case 'bookmark': {
        if (p?.url) out.push(embedOrLink(p.url, caption(p)));
        break;
      }
      default:
        warn({ code: 'unknown-block', message: `Skipped Notion block type "${node.type}" (${node.id})` });
    }
  }
  return out;
}
