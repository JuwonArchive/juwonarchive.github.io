import { describe, it, expect } from 'vitest';
import { igCrop } from '../../src/lib/ig-crop';

describe('igCrop', () => {
  it('wide posts use the full 400px width at their own height', () => {
    expect(igCrop(16 / 9)).toEqual({ width: 400, height: 225, offsetX: 0 });
  });
  it('posts taller than 4:5 sit in a 400×500 box; crop away the black side bars', () => {
    const c = igCrop(9 / 16);
    expect(c.height).toBe(500);
    expect(c.width).toBeCloseTo(281.25);
    expect(c.offsetX).toBeCloseTo((400 - 281.25) / 2);
  });
  it('a 4:5 post fills the box exactly', () => {
    expect(igCrop(0.8)).toEqual({ width: 400, height: 500, offsetX: 0 });
  });
});
