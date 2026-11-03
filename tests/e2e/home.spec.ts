import { test, expect } from '@playwright/test';
import { config } from '../../src/config';
import { ENGLISH_MAIN, expectNoBrokenWords, expectNoHorizontalScroll, trackErrors } from './helpers';

test.describe('home (depth 0)', () => {
  test('shows only the name, the subline and two ways in', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle('JUWON — 3D · AI · Graphic Designer');
    await expect(page.locator('h1')).toHaveText('JUWON');
    await expect(page.locator('[data-subline]')).toHaveText(config.subline);
    const ways = page.locator('nav[data-home-nav] a');
    await expect(ways).toHaveText(['ARCHIVE', 'INFO']);
    await expect(ways.nth(0)).toHaveAttribute('href', '/archive');
    await expect(ways.nth(1)).toHaveAttribute('href', '/info');
    await expect(page.locator('[data-category-item]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the two ways in sit in the bottom-right corner', async ({ page }) => {
    await page.goto('/');
    const box = (await page.locator('nav[data-home-nav]').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x + box.width).toBeGreaterThan(vp.width * 0.85);
    expect(box.y + box.height).toBeGreaterThan(vp.height * 0.85);
  });

  test('main text is English, unbroken, with no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    for (const t of await page.locator('h1, nav').allInnerTexts()) for (const line of t.split('\n').filter(Boolean)) expect(line.trim()).toMatch(ENGLISH_MAIN);
    await expectNoBrokenWords(page, 'h1');
    await expectNoHorizontalScroll(page);
  });
});

test('page background is pure white', async ({ page }) => {
  for (const path of ['/', '/archive', '/info']) {
    await page.goto(path);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
  }
});

test('main text is black again (user)', async ({ page }) => {
  for (const path of ['/', '/archive', '/info']) {
    await page.goto(path);
    expect(await page.locator('h1').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(17, 17, 17)');
  }
});
