import { describe, expect, it } from 'vitest';
import { CAMERA, SILHOUETTE, depthAlpha, depthWidth } from '../../src/scripts/orbit-halftone';

describe('orbit perspective (user: depth, but do not wipe the lines out)', () => {
  it('the near side is thicker and darker than the far side', () => {
    expect(depthWidth(1)).toBeGreaterThan(depthWidth(0) * 2.5);
    expect(depthAlpha(1)).toBeGreaterThan(depthAlpha(0) * 2.5);
    for (let n = 0; n < 1; n += 0.1) {
      expect(depthWidth(n + 0.1)).toBeGreaterThan(depthWidth(n));
      expect(depthAlpha(n + 0.1)).toBeGreaterThan(depthAlpha(n));
    }
  });
  it('the far side stays visible', () => {
    expect(depthAlpha(0)).toBeGreaterThanOrEqual(0.3);
    expect(depthWidth(0)).toBeGreaterThanOrEqual(0.5);
  });
  it('the camera is close enough for a clear perspective', () => {
    expect(CAMERA).toBeLessThan(3);
    expect(SILHOUETTE).toBeCloseTo(CAMERA / Math.sqrt(CAMERA ** 2 - 1), 6);
  });
});
