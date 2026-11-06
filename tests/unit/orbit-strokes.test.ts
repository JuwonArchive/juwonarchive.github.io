import { describe, expect, it } from 'vitest';
import { crossings, strokeSamples } from '../../src/scripts/orbit-halftone';

const line = (x0: number, y0: number, x1: number, y1: number, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
const DEG = Math.PI / 180;

describe('crossings (user: halftone only where lines cross)', () => {
  it('finds where two lines cross', () => {
    const c = crossings(line(0, 0, 100, 100), line(0, 100, 100, 0), 28 * DEG);
    expect(c).toHaveLength(1);
    const a = line(0, 0, 100, 100);
    const p = { x: a[c[0].i - 1].x + (a[c[0].i].x - a[c[0].i - 1].x) * c[0].t, y: a[c[0].i - 1].y + (a[c[0].i].y - a[c[0].i - 1].y) * c[0].t };
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });
  it('ignores shallow crossings (lines running side by side)', () => {
    expect(crossings(line(0, 0, 100, 10), line(0, 10, 100, 0), 28 * DEG)).toHaveLength(0);
    expect(crossings(line(0, 0, 100, 0), line(0, 50, 100, 50), 28 * DEG)).toHaveLength(0);
  });
});

describe('strokeSamples (user: wide in the middle, pointed at both ends)', () => {
  it('runs along the line both ways, tapering from 1 at the crossing to 0 at the ends', () => {
    const pts = line(0, 0, 400, 0, 40);
    const s = strokeSamples(pts, 21, 0, 100, 5); // crossing at x = 200
    const xs = s.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...xs)).toBeLessThanOrEqual(300);
    expect(Math.min(...xs)).toBeLessThan(106);
    expect(Math.max(...xs)).toBeGreaterThan(294);
    const at = (x: number) => s.find((p) => Math.abs(p.x - x) < 0.01)!.w;
    expect(at(200)).toBe(1);
    expect(at(250)).toBeCloseTo(0.75, 5);
    expect(at(150)).toBeCloseTo(0.75, 5);
    expect(at(295)).toBeLessThan(0.1);
    // Monotone taper on each side.
    const right = s.filter((p) => p.x >= 200).sort((a, b) => a.x - b.x).map((p) => p.w);
    for (let i = 1; i < right.length; i++) expect(right[i]).toBeLessThanOrEqual(right[i - 1]);
  });
  it('wraps around a closed orbit', () => {
    const ring = Array.from({ length: 61 }, (_, i) => ({ x: 100 * Math.cos((i / 60) * 2 * Math.PI), y: 100 * Math.sin((i / 60) * 2 * Math.PI) }));
    const s = strokeSamples(ring, 1, 0.1, 60, 4);
    expect(s.length).toBeGreaterThan(25); // both directions, across the seam
    for (const p of s) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(99);
  });
});
