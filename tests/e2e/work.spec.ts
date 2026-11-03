import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { ENGLISH_MAIN, expectNoBrokenWords, expectNoHorizontalScroll, trackErrors } from './helpers';

// Content comes from Notion and changes; derive every expectation from the synced data.
type W = (typeof site.works)[number];
const withVideo = site.works.find((w) => w.blocks.some((b) => b.type === 'video'));
const withEmbed = site.works.find((w) => w.blocks.some((b) => b.type === 'embed'));
const withText = site.works.find((w) => w.blocks.some((b) => b.type === 'paragraph')) ?? site.works[0];
const ai: W = withText;
const idx = site.works.indexOf(ai);
const firstParagraph = (w: W) => {
  const b = w.blocks.find((x) => x.type === 'paragraph') as { text: { text: string }[] } | undefined;
  return b?.text.map((t) => t.text).join('') ?? '';
};
const prev = site.works[(idx - 1 + site.works.length) % site.works.length];
const next = site.works[(idx + 1) % site.works.length];

test.describe('work detail', () => {
  test('shows the English title and the Notion body text', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/works/${ai.slug}`);
    await expect(page).toHaveTitle(`${ai.titleEn} — JUWON`);
    await expect(page.locator('h1')).toHaveText(ai.titleEn);
    expect((await page.locator('h1').innerText()).trim()).toMatch(ENGLISH_MAIN);
    if (firstParagraph(ai)) await expect(page.getByText(firstParagraph(ai), { exact: true }).first()).toBeVisible();
    await expectNoBrokenWords(page, 'h1');
    expect(errors).toEqual([]);
  });

  test('videos are muted inline loops that play only when visible', async ({ page }) => {
    test.skip(!withVideo, 'no uploaded videos in Notion');
    await page.goto(`/works/${withVideo!.slug}`);
    const videos = page.locator('video');
    expect(await videos.count()).toBeGreaterThan(0);
    for (const v of await videos.all()) {
      for (const attr of ['muted', 'playsinline', 'loop', 'controls']) await expect(v).toHaveAttribute(attr, /.*/);
      await expect(v).toHaveAttribute('preload', 'metadata');
      expect(await v.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
    }
    const first = videos.first();
    await first.scrollIntoViewIfNeeded();
    await expect.poll(() => first.evaluate((el: HTMLVideoElement) => !el.paused), { timeout: 10_000 }).toBe(true);
    // Scroll the video fully out of view, whichever direction is farther away.
    await first.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top > document.body.scrollHeight / 2 ? 0 : document.body.scrollHeight);
    });
    await expect.poll(() => first.evaluate((el: HTMLVideoElement) => el.paused), { timeout: 10_000 }).toBe(true);
  });

  test('embeds load lazily and allow fullscreen', async ({ page }) => {
    test.skip(!withEmbed, 'no embeds in Notion');
    await page.goto(`/works/${withEmbed!.slug}`);
    const frames = page.locator('iframe');
    expect(await frames.count()).toBeGreaterThan(0);
    for (const f of await frames.all()) {
      await expect(f).toHaveAttribute('loading', 'lazy');
      await expect(f).toHaveAttribute('allowfullscreen', /.*/);
      await expect(f).toHaveAttribute('title', /.+/);
    }
  });

  test('links to previous and next work, wrapping around, and to contact', async ({ page }) => {
    await page.goto(`/works/${ai.slug}`);
    await expect(page.getByRole('link', { name: 'NEXT →' })).toHaveAttribute('href', `/works/${next.slug}`);
    await expect(page.getByRole('link', { name: '← PREV' })).toHaveAttribute('href', `/works/${prev.slug}`);
    if (site.contact.email) await expect(page.locator('main').getByRole('link', { name: 'CONTACT' })).toHaveAttribute('href', `mailto:${site.contact.email}`);
    await page.goto(`/works/${site.works[0].slug}`);
    await expect(page.getByRole('link', { name: '← PREV' })).toHaveAttribute('href', `/works/${site.works.at(-1)!.slug}`);
  });

  test('every work page renders without horizontal scroll', async ({ page }) => {
    for (const w of site.works) {
      const errors = trackErrors(page);
      await page.goto(`/works/${w.slug}`);
      await expect(page.locator('h1')).toHaveText(w.titleEn);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    }
  });
});

test.describe('uniform media frames', () => {
  test('every image, video and embed sits in the same 16:9 frame, at most 1280px wide', async ({ page }) => {
    for (const w of site.works) {
      await page.goto(`/works/${w.slug}`);
      const frames = await page.locator('[data-frame]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      const mediaCount = w.blocks.filter((b) => ['image', 'video', 'embed'].includes(b.type)).length;
      expect(frames.length).toBe(mediaCount);
      const widths = new Set(frames.map((f) => Math.round(f.width)));
      expect(widths.size).toBeLessThanOrEqual(1);
      for (const f of frames) {
        expect(f.width).toBeLessThanOrEqual(1280);
        expect(Math.abs(f.width / f.height - 16 / 9)).toBeLessThan(0.01);
      }
    }
  });

  test('images are shown whole and open full size on click', async ({ page }) => {
    const w = site.works.find((x) => x.blocks.some((b) => b.type === 'image'));
    test.skip(!w, 'no images');
    await page.goto(`/works/${w!.slug}`);
    const img = page.locator('[data-frame] img').first();
    await expect(img).toHaveCSS('object-fit', 'contain');
    const link = page.locator('a[data-frame]:has(img)').first();
    await expect(link).toHaveAttribute('href', (await img.getAttribute('src'))!);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
