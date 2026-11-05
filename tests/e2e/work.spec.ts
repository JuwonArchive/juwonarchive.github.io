import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { splitSections } from '../../src/lib/sections';
import type { Block } from '../../src/lib/site-schema';
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
    await page.goto(`/archive/${ai.slug}`);
    await expect(page).toHaveTitle(`${ai.titleEn} — JUWON`);
    await expect(page.locator('h1')).toHaveText(ai.titleEn);
    expect((await page.locator('h1').innerText()).trim()).toMatch(ENGLISH_MAIN);
    // Leading text is folded into MORE INFO (spec §11); open it before looking.
    const more = page.locator('details[data-more-info] summary');
    if (await more.count()) await more.click();
    if (firstParagraph(ai)) await expect(page.getByText(firstParagraph(ai), { exact: true }).first()).toBeVisible();
    await expectNoBrokenWords(page, 'h1');
    expect(errors).toEqual([]);
  });

  test('videos are muted inline loops that play only when visible', async ({ page }) => {
    test.skip(!withVideo, 'no uploaded videos in Notion');
    await page.goto(`/archive/${withVideo!.slug}`);
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
    await page.goto(`/archive/${withEmbed!.slug}`);
    const frames = page.locator('iframe');
    expect(await frames.count()).toBeGreaterThan(0);
    for (const f of await frames.all()) {
      await expect(f).toHaveAttribute('loading', 'lazy');
      await expect(f).toHaveAttribute('allowfullscreen', /.*/);
      await expect(f).toHaveAttribute('title', /.+/);
    }
  });

  test('links to previous and next work, wrapping around, and to contact', async ({ page }) => {
    await page.goto(`/archive/${ai.slug}`);
    await expect(page.getByRole('link', { name: 'NEXT →' })).toHaveAttribute('href', `/archive/${next.slug}`);
    await expect(page.locator('header').getByRole('link', { name: '← ARCHIVE' })).toHaveAttribute('href', '/archive');
    await expect(page.locator('header').getByRole('link', { name: 'INFO' })).toHaveAttribute('href', '/info');
    await expect(page.getByRole('link', { name: '← PREV' })).toHaveAttribute('href', `/archive/${prev.slug}`);
    if (site.contact.email) await expect(page.locator('main').getByRole('link', { name: 'CONTACT' })).toHaveAttribute('href', `mailto:${site.contact.email}`);
    await page.goto(`/archive/${site.works[0].slug}`);
    await expect(page.getByRole('link', { name: '← PREV' })).toHaveAttribute('href', `/archive/${site.works.at(-1)!.slug}`);
  });

  test('every work page renders without horizontal scroll', async ({ page }) => {
    for (const w of site.works) {
      const errors = trackErrors(page);
      await page.goto(`/archive/${w.slug}`);
      await expect(page.locator('h1')).toHaveText(w.titleEn);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    }
  });
});

test.describe('media at a uniform 880px width (user)', () => {
  test('every image, video and embed is the same width, ≤880px, at its own aspect (never cropped)', async ({ page }) => {
    for (const w of site.works) {
      await page.goto(`/archive/${w.slug}`);
      const frames = page.locator('[data-frame]');
      const n = await frames.count();
      if (!n) continue;
      const widths = new Set<number>();
      for (const f of await frames.all()) {
        await f.scrollIntoViewIfNeeded();
        const r = await f.evaluate(async (el) => {
          const box = el.getBoundingClientRect();
          const img = el.querySelector('img');
          const vid = el.querySelector('video');
          if (img) {
            if (!img.complete) await new Promise((res) => img.addEventListener('load', res, { once: true }));
            return { w: box.width, h: box.height, aspect: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit };
          }
          if (vid) {
            if (vid.readyState < 1) await new Promise((res) => vid.addEventListener('loadedmetadata', res, { once: true }));
            return { w: box.width, h: box.height, aspect: vid.videoWidth / vid.videoHeight, fit: getComputedStyle(vid).objectFit };
          }
          const crop = el.querySelector<HTMLElement>('[data-ig-crop]');
          const aspect = crop ? Number(crop.dataset.w) / Number(crop.dataset.h) : 16 / 9;
          return { w: box.width, h: box.height, aspect, fit: 'contain' };
        });
        widths.add(Math.round(r.w));
        expect(r.w).toBeLessThanOrEqual(880.5);
        expect(r.fit).not.toBe('cover');
        expect(Math.abs(r.w / r.h - r.aspect) / r.aspect).toBeLessThan(0.03);
      }
      expect(widths.size).toBe(1);
    }
  });

  test('Instagram posts carry a button to the original post', async ({ page }) => {
    const w = site.works.find((x) => x.blocks.some((b) => ('source' in b && b.source) || (b.type === 'embed' && 'provider' in b && b.provider === 'instagram')));
    test.skip(!w, 'no Instagram posts');
    await page.goto(`/archive/${w!.slug}`);
    const igFigures = page.locator('figure:has([data-ig-link])');
    const expected = w!.blocks.filter((b) => ('source' in b && b.source) || (b.type === 'embed' && 'provider' in b && b.provider === 'instagram')).length;
    await expect(igFigures).toHaveCount(expected);
    for (const link of await page.locator('[data-frame] a[data-ig-link]').all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\/www\.instagram\.com\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveText(/INSTAGRAM/);
    }
  });
});

test.describe('archive item depth', () => {
  test('summary, folded MORE INFO and numbered sections follow the Notion page', async ({ page }) => {
    for (const w of site.works) {
      const { intro, sections } = splitSections(w.blocks as Block[]);
      await page.goto(`/archive/${w.slug}`);
      const more = page.locator('details[data-more-info]');
      if (intro.length) {
        await expect(more).toHaveCount(1);
        await expect(more.locator('summary')).toHaveText('+ MORE INFO');
        await expect(more).not.toHaveAttribute('open', /.*/);
        await more.locator('summary').click();
        await expect(more).toHaveAttribute('open', /.*/);
      } else {
        await expect(more).toHaveCount(0);
      }
      const labels = page.locator('[data-section-label]');
      await expect(labels).toHaveText(sections.map((_, i) => `SECTION ${String(i + 1).padStart(2, '0')}`));
    }
  });

  test('every media frame has crop marks', async ({ page }) => {
    for (const w of site.works) {
      await page.goto(`/archive/${w.slug}`);
      const frames = await page.locator('[data-frame]').count();
      await expect(page.locator('[data-cropmarks]')).toHaveCount(frames);
    }
  });

  test('old /works links land on the new page', async ({ page }) => {
    await page.goto(`/works/${site.works[1].slug}`);
    await expect(page).toHaveURL(new RegExp(`/archive/${site.works[1].slug}/?$`));
  });
});
