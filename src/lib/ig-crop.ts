/** Instagram's embed renders posts 400px wide and caps the media box at 4:5 (taller posts get black side bars). */
export const IG_WIDTH = 400;
const MAX_TALL = 0.8; // 4:5

/** The rectangle (in embed pixels, below the 54px header) that holds only the post's pixels. */
export function igCrop(aspect: number): { width: number; height: number; offsetX: number } {
  const height = IG_WIDTH / Math.max(aspect, MAX_TALL);
  const width = Math.min(IG_WIDTH, height * aspect);
  return { width, height, offsetX: (IG_WIDTH - width) / 2 };
}
