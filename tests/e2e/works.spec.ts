import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { ENGLISH_MAIN, expectNoBrokenWords, expectNoHorizontalScroll, trackErrors } from './helpers';

test.describe('works', () => {
  test('lists every work as a card in Notion order', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/works');
    await expect(page).toHaveTitle('WORKS — JUWON');
    await expect(page.locator('h1')).toHaveText('WORKS');
    await expect(page.locator('[data-count]')).toHaveText(String(site.works.length).padStart(2, '0'));
    await expect(page.locator('header nav a[aria-current="page"]')).toHaveText('WORKS');
    const cards = page.locator('a.work-card');
    await expect(cards).toHaveCount(site.works.length);
    for (const [i, w] of site.works.entries()) {
      await expect(cards.nth(i)).toHaveAttribute('href', `/works/${w.slug}`);
      await expect(cards.nth(i).locator('[data-card-title]')).toHaveText(w.titleEn);
    }
    expect(errors).toEqual([]);
  });

  test('never renders an image without a source', async ({ page }) => {
    await page.goto('/works');
    const bad = await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => !i.getAttribute('src')).length);
    expect(bad).toBe(0);
  });

  test('main text is English and does not break mid-word', async ({ page }) => {
    await page.goto('/works');
    const texts = await page.locator('h1, [data-card-title]').allInnerTexts();
    for (const t of texts) expect(t.trim()).toMatch(ENGLISH_MAIN);
    await expectNoBrokenWords(page, 'h1, [data-card-title]');
  });

  test('arrow keys move through the stack', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop stack only');
    await page.goto('/works');
    const cards = page.locator('a.work-card');
    await expect(cards.nth(0)).toHaveAttribute('data-active', '');
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toHaveAttribute('data-active', '');
    await expect(cards.nth(0)).not.toHaveAttribute('data-active', '');
    await page.keyboard.press('ArrowLeft');
    await expect(cards.nth(0)).toHaveAttribute('data-active', '');
  });

  test('ctrl+wheel zoom is not blocked', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop stack only');
    await page.goto('/works');
    const blocked = await page.evaluate(() => {
      const e = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true, bubbles: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(blocked).toBe(false);
  });

  test('stacks cards vertically on phones', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout');
    await page.goto('/works');
    const boxes = await page.locator('a.work-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom - 1);
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('/works');
    await expectNoHorizontalScroll(page);
  });

  test('opens a work from its card', async ({ page }) => {
    await page.goto('/works');
    await page.locator('a.work-card').first().click();
    await expect(page).toHaveURL(new RegExp(`/works/${site.works[0].slug}$`));
  });
});
