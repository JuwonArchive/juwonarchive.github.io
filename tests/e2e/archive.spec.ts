import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { ENGLISH_MAIN, expectNoHorizontalScroll, trackErrors } from './helpers';

test.describe('archive (depth 1)', () => {
  test('one archive box per work, in Notion order, opening its page', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/archive');
    await expect(page).toHaveTitle('ARCHIVE — JUWON');
    await expect(page.locator('h1')).toHaveText('ARCHIVE');
    await expect(page.locator('header a[aria-current="page"]')).toHaveText('ARCHIVE');
    const boxes = page.locator('a[data-archive-box]');
    await expect(boxes).toHaveCount(site.works.length);
    for (const [i, w] of site.works.entries()) {
      await expect(boxes.nth(i)).toHaveAttribute('href', `/archive/${w.slug}`);
      await expect(boxes.nth(i).locator('[data-box-name]')).toHaveText(w.titleEn);
      expect((await boxes.nth(i).locator('[data-box-name]').innerText()).trim()).toMatch(ENGLISH_MAIN);
      if (w.cover) await expect(boxes.nth(i).locator('img')).toHaveAttribute('src', w.cover.src);
      else await expect(boxes.nth(i).locator('[data-box-face-title]')).toHaveText(w.titleEn);
    }
    expect(errors).toEqual([]);
  });

  test('never renders an image without a source', async ({ page }) => {
    await page.goto('/archive');
    expect(await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => !i.getAttribute('src')).length)).toBe(0);
  });

  test('boxes sit in one row on desktop and two columns on phones', async ({ page, isMobile }) => {
    await page.goto('/archive');
    const tops = await page.locator('a[data-archive-box]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    if (isMobile) {
      expect(tops[0]).toBe(tops[1]);
      if (tops.length > 2) expect(tops[2]).toBeGreaterThan(tops[0]);
    } else {
      expect(new Set(tops).size).toBe(1);
    }
    await expectNoHorizontalScroll(page);
  });

  test('keyboard can reach and open a box', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await page.goto('/archive');
    const first = page.locator('a[data-archive-box]').first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/archive/${site.works[0].slug}/?$`));
  });

  test('old /works links land on /archive', async ({ page }) => {
    await page.goto('/works');
    await expect(page).toHaveURL(/\/archive\/?$/);
  });
});

test.describe('opening a box', () => {
  test('the lid opens and the view dives in before the page changes', async ({ page }) => {
    await page.goto('/archive');
    const box = page.locator('a[data-archive-box]').nth(1);
    await box.click();
    await expect(box).toHaveAttribute('data-opening', '');
    await expect(page.locator('[data-dive]')).toHaveAttribute('data-active', '');
    await expect(page).toHaveURL(new RegExp(`/archive/${site.works[1].slug}/?$`), { timeout: 5000 });
    // The item page arrives out of the same tint.
    await expect(page.locator('[data-arrive]')).toHaveCount(1);
  });

  test('reduced motion skips the dive and goes straight in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/archive');
    const box = page.locator('a[data-archive-box]').nth(1);
    await box.click();
    await expect(page).toHaveURL(new RegExp(`/archive/${site.works[1].slug}/?$`), { timeout: 1500 });
  });
});

test('each cover sits whole inside its box: its own shape, nothing cropped (user)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/archive');
  const cards = page.locator('a[data-archive-box] .card:has(img)');
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const r = await cards.nth(i).evaluate(async (card) => {
      const img = card.querySelector('img')!;
      img.loading = 'eager';
      if (!img.complete) await new Promise((res) => img.addEventListener('load', res, { once: true }));
      // Untransformed layout size (the box is drawn in 3D).
      return {
        card: card.offsetWidth / card.offsetHeight,
        img: img.naturalWidth / img.naturalHeight,
        fit: getComputedStyle(img).objectFit,
        fitsW: card.offsetWidth <= (card.parentElement as HTMLElement).offsetWidth * 0.73,
      };
    });
    expect(r.fit).not.toBe('cover');
    expect(Math.abs(r.card - r.img) / r.img).toBeLessThan(0.03);
    expect(r.fitsW).toBe(true);
  }
});
