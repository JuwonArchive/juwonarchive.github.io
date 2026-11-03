export type RichText = { text: string; href?: string; bold?: boolean; italic?: boolean; code?: boolean }[];
export type Media = { id: string; src: string; kind: 'image' | 'video'; width?: number; height?: number; bytes?: number };
export type EmbedProvider = 'youtube' | 'vimeo' | 'instagram' | 'other';
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: RichText }
  | { type: 'paragraph'; text: RichText }
  | { type: 'list'; ordered: boolean; items: RichText[] }
  | { type: 'quote'; text: RichText }
  | { type: 'divider' }
  | { type: 'image'; media: Media; caption?: RichText; /** original post (e.g. Instagram) */ source?: string }
  | { type: 'video'; media: Media; caption?: RichText; /** original post (e.g. Instagram) */ source?: string }
  | { type: 'embed'; url: string; embedUrl: string; provider: EmbedProvider; caption?: RichText; /** width / height of the post itself (Instagram) */ aspect?: number }
  | { type: 'fallback-link'; url: string; label: string };
export type Work = {
  slug: string;
  titleEn: string;
  titleKo: string;
  tags: string[];
  cover?: Media;
  link?: string;
  /** Notion page URL; target of fallback links. */
  notionUrl?: string;
  blocks: Block[];
};
export type ExperienceItem = { label: string; period?: string; sortKey: number };
export type SiteData = {
  generatedAt: string;
  contact: { email?: string; instagram?: { handle: string; url: string }; location?: string; phone?: string };
  experience: ExperienceItem[];
  skills: { software: string[]; expertise: string[]; language: string[] };
  works: Work[];
};
export type Warning = { code: string; message: string };
