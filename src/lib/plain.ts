import type { RichText } from './site-schema';

export function plainText(rt: RichText): string {
  return rt.map((s) => s.text).join('');
}
