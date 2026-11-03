import { describe, it, expect } from 'vitest';
import { longestWord } from '../../src/lib/fit';

describe('longestWord', () => {
  it('returns the length of the longest word', () => {
    expect(longestWord('TOUCHDESIGNER')).toBe(13);
    expect(longestWord('AI GENERATED')).toBe(9);
    expect(longestWord('  ')).toBe(1);
  });
});
