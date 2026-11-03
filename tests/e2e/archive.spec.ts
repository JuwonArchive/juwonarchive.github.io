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
