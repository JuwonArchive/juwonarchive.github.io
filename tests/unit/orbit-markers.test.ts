import { describe, expect, it } from 'vitest';
import { markerPhaseOf } from '../../src/scripts/orbit-halftone';

// Distance between two phases around a loop (0…0.5).
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

describe('markerPhaseOf (user: the dots travelled bunched up)', () => {
  it('markers sharing an orbit stay evenly spread, at any time', () => {
    for (const t of [0, 7.3, 42, 300]) {
      // 5 markers: 01 & 04 share orbit 0, 02 & 05 share orbit 1.
      expect(gap(markerPhaseOf(0, 5, t), markerPhaseOf(3, 5, t))).toBeCloseTo(0.5, 6);
      expect(gap(markerPhaseOf(1, 5, t), markerPhaseOf(4, 5, t))).toBeCloseTo(0.5, 6);
    }
  });
  it('spreads three on one orbit a third apart', () => {
    const ps = [0, 3, 6].map((i) => markerPhaseOf(i, 9, 12));
    expect(gap(ps[0], ps[1])).toBeCloseTo(1 / 3, 6);
    expect(gap(ps[1], ps[2])).toBeCloseTo(1 / 3, 6);
  });
  it('the middle orbit runs the other way', () => {
    const d0 = markerPhaseOf(0, 5, 1) - markerPhaseOf(0, 5, 0);
    const d1 = markerPhaseOf(1, 5, 1) - markerPhaseOf(1, 5, 0);
    expect(Math.sign(d0)).not.toBe(Math.sign(d1));
  });
  it('stays in 0…1', () => {
    for (let i = 0; i < 5; i++) for (const t of [-5, 0, 1e4]) {
      const p = markerPhaseOf(i, 5, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});
