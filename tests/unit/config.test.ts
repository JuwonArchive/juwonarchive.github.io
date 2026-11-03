import { describe, it, expect } from 'vitest';
import { config } from '../../src/config';

describe('config', () => {
  it('hides the phone number by default', () => {
    expect(config.showPhone).toBe(false);
  });
  it('uses the approved headline and subline', () => {
    expect(config.headline).toBe('JUWON');
    expect(config.subline).toBe('3D · AI · GRAPHIC DESIGNER — BASED IN ILSAN, KOREA');
    expect(config.homeTitle).toBe('JUWON — 3D · AI · Graphic Designer');
  });
  it('maps Korean category names to English', () => {
    expect(config.categoryNames['AI 생성']).toBe('AI GENERATED');
    expect(config.categoryNames['3D 디자인']).toBe('3D DESIGN');
  });
});
