import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/snapshot.json';
import { publishedHash, snapshotHash } from '../../src/lib/notion/hash';
import type { NotionSnapshot } from '../../src/lib/notion/types';

const snap = () => structuredClone(fixture) as unknown as NotionSnapshot;

describe('snapshotHash', () => {
  it('ignores signed URL query strings that change on every fetch', () => {
    const a = snap();
    const b = JSON.parse(JSON.stringify(snap()).replaceAll('X-Amz-Signature=abc', 'X-Amz-Signature=zzz')) as NotionSnapshot;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });
  it('changes when content changes', () => {
    const a = snap();
    const b = snap();
    b.projects[1].blocks[0].paragraph.rich_text[0].plain_text = '다른 글';
    expect(snapshotHash(a)).not.toBe(snapshotHash(b));
  });
  it('is a sha256 hex string', () => {
    expect(snapshotHash(snap())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('publishedHash', () => {
  it('is the content hash when every file arrived', () => {
    expect(publishedHash('abc', [{ code: 'missing-english-title', message: '' }])).toBe('abc');
  });
  it('is marked partial when a media download failed, so the next run retries', () => {
    expect(publishedHash('abc', [{ code: 'media-failed', message: '' }])).toBe('abc-partial');
  });
});
