export const config = {
  /** Set to true to show the phone number on the site (spec §1). */
  showPhone: false,
  /** Fallback English names for Notion project rows without `영문 제목`. */
  categoryNames: {
    '3D 디자인': '3D DESIGN',
    'AI 생성': 'AI GENERATED',
    '2D': '2D GRAPHIC',
    TouchDesigner: 'TOUCHDESIGNER',
  } as Record<string, string>,
  headline: 'JUWON',
  subline: '3D · AI · GRAPHIC DESIGNER — BASED IN ILSAN, KOREA',
  homeTitle: 'JUWON — 3D · AI · Graphic Designer',
  description: 'Portfolio of JUWON — 3D, AI-generated motion and graphic design. Based in Ilsan, Korea.',
  /** Background tints cycled per work index. */
  pastels: ['#E6E4F2', '#E3EEE8', '#F2E6E4', '#E4ECF2'],
};
