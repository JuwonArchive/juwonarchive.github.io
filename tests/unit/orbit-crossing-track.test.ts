import { describe, expect, it } from 'vitest';
import { trackCrossings } from '../../src/scripts/orbit-halftone';

describe('trackCrossings (user: halftone appears and ripples out the moment lines cross)', () => {
  it('a crossing that moves a little keeps its birth time; a new one is born now', () => {
    const prev = [{ key: '0-1', x: 100, y: 100, born: 2, seen: 4 }];
    const next = trackCrossings(prev, [{ key: '0-1', x: 104, y: 98 }, { key: '0-3', x: 300, y: 50 }], 5).now;
    expect(next.map((c) => c.born)).toEqual([2, 5]);
  });
  it('a different pair is new; the same pair keeps its crossing even after a big jump (fast turn)', () => {
    const prev = [{ key: '0-1', x: 100, y: 100, born: 2, seen: 4 }];
    expect(trackCrossings(prev, [{ key: '1-2', x: 100, y: 100 }], 5).now[0].born).toBe(5);
    expect(trackCrossings(prev, [{ key: '0-1', x: 200, y: 100 }], 5).now[0].born).toBe(2);
  });
  it('only the extra crossing is new when a pair gains one', () => {
    const prev = [{ key: '0-1', x: 100, y: 100, born: 2, seen: 4 }];
    const next = trackCrossings(prev, [{ key: '0-1', x: 400, y: 300 }, { key: '0-1', x: 110, y: 100 }], 5).now;
    expect(next.map((c) => c.born)).toEqual([5, 2]);
  });
  it('two crossings of the same pair are matched one to one', () => {
    const prev = [
      { key: '0-1', x: 100, y: 100, born: 1, seen: 8 },
      { key: '0-1', x: 300, y: 100, born: 3, seen: 8 },
    ];
    const next = trackCrossings(prev, [{ key: '0-1', x: 302, y: 101 }, { key: '0-1', x: 99, y: 100 }], 9).now;
    expect(next.map((c) => c.born)).toEqual([3, 1]);
  });
  it('a crossing that flickers out for a moment is not reborn (remembered briefly)', () => {
    const first = trackCrossings([], [{ key: '0-1', x: 100, y: 100 }], 1);
    const gap = trackCrossings(first.memory, [], 1.1);
    expect(gap.memory).toHaveLength(1);
    const back = trackCrossings(gap.memory, [{ key: '0-1', x: 103, y: 100 }], 1.2);
    expect(back.now[0].born).toBe(1);
    // Gone for longer than the memory: a later one is new.
    const gone = trackCrossings(trackCrossings(first.memory, [], 2).memory, [{ key: '0-1', x: 100, y: 100 }], 2.1);
    expect(gone.now[0].born).toBe(2.1);
  });
});
