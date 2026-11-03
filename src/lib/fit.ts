/**
 * Display type is sized so its longest word always fits on one line:
 * font-size = min(max size, available width / (chars × glyph width)).
 * Archivo at 125% width / 900 weight averages ~0.86em per uppercase glyph.
 */
export function longestWord(text: string): number {
  return Math.max(1, ...text.split(/\s+/).map((w) => w.length));
}
