import type { Warning } from '../site-schema';
import { createHash } from 'node:crypto';
import type { NotionSnapshot } from './types';

/** Notion file URLs are re-signed on every request; drop the query so the hash only tracks content. */
function normalise(value: unknown): unknown {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? value.split('?')[0] : value;
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'expiry_time') continue;
      out[key] = normalise((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function snapshotHash(s: NotionSnapshot): string {
  return createHash('sha256').update(JSON.stringify(normalise(s))).digest('hex');
}

/**
 * The hash written to the deployed site. When a media download failed, the published
 * hash never matches Notion's, so the next hourly run rebuilds and retries the file.
 */
export function publishedHash(hash: string, warnings: Warning[]): string {
  return warnings.some((w) => w.code === 'media-failed') ? `${hash}-partial` : hash;
}
