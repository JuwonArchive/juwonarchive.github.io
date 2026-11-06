import { describe, expect, it } from 'vitest';
import { waveStrength } from '../../src/scripts/orbit-halftone';

const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);

describe('waveStrength (user: 1 angle, 2 depth, 3 several lines)', () => {
  it('1. steeper crossings hit harder', () => {
    const shallow = waveStrength({ sin: sin(30), z: 1, neighbours: 0 });
    const steep = waveStrength({ sin: sin(85), z: 1, neighbours: 0 });
    expect(steep).toBeGreaterThan(shallow * 2);
  });
  it('2. crossings in front of the sphere hit harder than those behind', () => {
    const back = waveStrength({ sin: sin(80), z: -1, neighbours: 0 });
    const front = waveStrength({ sin: sin(80), z: 1, neighbours: 0 });
    expect(front).toBeGreaterThan(back * 1.6);
  });
  it('3. three or more lines meeting give a bigger wave', () => {
    const two = waveStrength({ sin: sin(60), z: 0.5, neighbours: 0 });
    const more = waveStrength({ sin: sin(60), z: 0.5, neighbours: 2 });
    expect(more).toBeGreaterThan(two * 1.4);
  });
  it('stays in range', () => {
    expect(waveStrength({ sin: 1, z: 1, neighbours: 3 })).toBeLessThanOrEqual(1.3);
    expect(waveStrength({ sin: sin(28), z: -1, neighbours: 0 })).toBeGreaterThan(0);
  });
});
