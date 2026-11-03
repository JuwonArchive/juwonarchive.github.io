import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { config } from '../../src/config';
import { ENGLISH_MAIN, expectNoBrokenWords, expectNoHorizontalScroll, trackErrors } from './helpers';

test.describe('home', () => {
  test('shows the JUWON headline and subline', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('JUWON');
    await expect(page.locator('[data-subline]')).toHaveText(config.subline);
    await expect(page).toHaveTitle('JUWON — 3D · AI · Graphic Designer');
    expect(errors).toEqual([]);
  });

  test('nav links to works, about and email', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'WORKS' })).toHaveAttribute('href', '/works');
    await expect(nav.getByRole('link', { name: 'ABOUT' })).toHaveAttribute('href', '/about');
    await expect(nav.getByRole('link', { name: 'CONTACT' })).toHaveAttribute('href', `mailto:${site.contact.email}`);
  });

  test('lists every work by English title, linking to its page', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('[data-category-item]');
    await expect(items).toHaveCount(site.works.length);
    for (const [i, w] of site.works.entries()) {
      await expect(items.nth(i).locator('[data-title]')).toHaveText(w.titleEn);
      await expect(items.nth(i)).toHaveAttribute('href', `/works/${w.slug}`);
    }
  });

  test('main text is English only', async ({ page }) => {
    await page.goto('/');
    const texts = await page.locator('header, h1, h2, nav, [data-category-item]').evaluateAll((els) =>
      els.flatMap((el) => (el as HTMLElement).innerText.split('\n')).map((t) => t.trim()).filter(Boolean),
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).toMatch(ENGLISH_MAIN);
  });

  test('footer shows location, Seoul time and email', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('ILSAN, KOREA');
    await expect(footer.locator('[data-clock]')).toHaveText(/^\d{2}:\d{2} KST$/);
    if (site.contact.email) await expect(footer.getByRole('link', { name: site.contact.email })).toHaveAttribute('href', `mailto:${site.contact.email}`);
  });

  test('hovering a work tints the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover only');
    await page.goto('/');
    const before = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--page-bg').trim());
    await page.locator('[data-category-item]').first().hover();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--page-bg').trim())).not.toBe(before);
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalScroll(page);
  });

  test('display words never break mid-word', async ({ page }) => {
    await page.goto('/');
    await expectNoBrokenWords(page, 'h1, [data-title]');
  });
});
