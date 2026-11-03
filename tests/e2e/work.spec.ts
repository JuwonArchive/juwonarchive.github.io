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

test.describe('uniform media frames', () => {
  test('every image, video and embed sits in the same 16:9 frame, at most 1280px wide', async ({ page }) => {
    for (const w of site.works) {
      await page.goto(`/archive/${w.slug}`);
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
    await page.goto(`/archive/${w!.slug}`);
    const img = page.locator('[data-frame] img').first();
    await expect(img).toHaveCSS('object-fit', 'contain');
    const link = page.locator('a[data-frame]:has(img)').first();
    await expect(link).toHaveAttribute('href', (await img.getAttribute('src'))!);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});

test.describe('instagram crop', () => {
  const igWork = site.works.find((w) => w.blocks.some((b) => b.type === 'embed' && 'aspect' in b && b.aspect));
  test('shows only the post, cropped to its own aspect and centred in the frame', async ({ page }) => {
    test.skip(!igWork, 'no sized Instagram embeds');
    await page.goto(`/archive/${igWork!.slug}`);
    const aspects = igWork!.blocks.filter((b) => b.type === 'embed' && 'aspect' in b && b.aspect).map((b) => (b as { aspect: number }).aspect);
    const boxes = await page.locator('[data-ig-crop]').evaluateAll((els) =>
      els.map((el) => {
        const crop = el.getBoundingClientRect();
        const frame = el.closest('[data-frame]')!.getBoundingClientRect();
        const iframe = el.querySelector('iframe')!.getBoundingClientRect();
        return { crop: crop.toJSON(), frame: frame.toJSON(), headerHidden: iframe.top < crop.top - 1 };
      }),
    );
    expect(boxes.length).toBe(aspects.length);
    boxes.forEach(({ crop, frame, headerHidden }, i) => {
      expect(Math.abs(crop.width / crop.height - aspects[i])).toBeLessThan(0.03);
      expect(crop.left).toBeGreaterThanOrEqual(frame.left - 1);
      expect(crop.right).toBeLessThanOrEqual(frame.right + 1);
      expect(crop.top).toBeGreaterThanOrEqual(frame.top - 1);
      expect(crop.bottom).toBeLessThanOrEqual(frame.bottom + 1);
      // Fills the frame on one axis.
      expect(Math.max(crop.width / frame.width, crop.height / frame.height)).toBeGreaterThan(0.98);
      expect(headerHidden).toBe(true);
    });
  });
});

test.describe('resolution and sources', () => {
  test('images are never stretched beyond their original pixels', async ({ page }) => {
    for (const w of site.works.filter((x) => x.blocks.some((b) => b.type === 'image'))) {
      await page.goto(`/archive/${w.slug}`);
      const imgs = page.locator('[data-frame] img');
      for (const img of await imgs.all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
        const r = await img.evaluate((el: HTMLImageElement) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, nw: el.naturalWidth, nh: el.naturalHeight }));
        // Fitting down is fine; stretching up past the image's own pixels blurs it.
        expect(r.w).toBeLessThanOrEqual(r.nw + 1);
        expect(r.h).toBeLessThanOrEqual(r.nh + 1);
      }
    }
  });

  test('posts copied from Instagram link back to the original post', async ({ page }) => {
    const w = site.works.find((x) => x.blocks.some((b) => 'source' in b && b.source));
    test.skip(!w, 'no Instagram originals');
    await page.goto(`/archive/${w!.slug}`);
    const sources = w!.blocks.filter((b) => 'source' in b && b.source).map((b) => (b as { source: string }).source);
    for (const src of sources) {
      const link = page.locator(`figcaption a[href="${src}"]`);
      await expect(link).toHaveText('OPEN ON INSTAGRAM ↗');
      await expect(link).toHaveAttribute('target', '_blank');
    }
  });
});


test.describe('tall images', () => {
  const tallWork = site.works.find((w) => w.blocks.some((b) => b.type === 'image' && !!b.media && b.media.height! > b.media.width! * 2));
  test('show their top at a readable width and open full size on click', async ({ page }) => {
    test.skip(!tallWork, 'no tall images');
    await page.goto(`/archive/${tallWork!.slug}`);
    const tall = page.locator('a[data-frame][data-tall]');
    expect(await tall.count()).toBeGreaterThan(0);
    for (const frame of await tall.all()) {
      await frame.scrollIntoViewIfNeeded();
      const img = frame.locator('img');
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const r = await img.evaluate((el: HTMLImageElement) => ({
        w: el.getBoundingClientRect().width,
        nw: el.naturalWidth,
        fw: el.closest('[data-frame]')!.getBoundingClientRect().width,
        pos: getComputedStyle(el).objectPosition,
      }));
      expect(r.w).toBeGreaterThanOrEqual(Math.min(r.nw, r.fw) * 0.99);
      expect(r.w).toBeLessThanOrEqual(r.nw + 1);
      expect(r.pos.startsWith('50% 0%')).toBe(true);
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
