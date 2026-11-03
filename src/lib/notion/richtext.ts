import type { RichText } from '../site-schema';

export function toRichText(rt: any[] | undefined): RichText {
  return (rt ?? []).map((seg) => {
    const out: RichText[number] = { text: seg.plain_text ?? seg.text?.content ?? '' };
    const href = seg.href ?? seg.text?.link?.url;
    if (href) out.href = href;
    if (seg.annotations?.bold) out.bold = true;
    if (seg.annotations?.italic) out.italic = true;
    if (seg.annotations?.code) out.code = true;
    return out;
  });
}

export function plain(rt: RichText): string {
  return rt.map((s) => s.text).join('');
}
