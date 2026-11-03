import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { ENGLISH_MAIN, expectNoBrokenWords, expectNoHorizontalScroll, trackErrors } from './helpers';

test.describe('info', () => {
  test('has the English section headings', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/info');
    await expect(page).toHaveTitle('INFO — JUWON');
    await expect(page.locator('h1')).toHaveText('INFO');
    await expect(page.locator('header nav a[aria-current="page"]')).toHaveText('INFO');
    await expect(page.locator('h2')).toHaveText(['EXPERIENCE', 'TOOLS', 'EXPERTISE', 'LANGUAGE', 'CONTACT']);
    for (const t of await page.locator('h1, h2').allInnerTexts()) expect(t.trim()).toMatch(ENGLISH_MAIN);
    await expectNoBrokenWords(page, 'h1');
    expect(errors).toEqual([]);
  });

  test('lists experience newest first with periods', async ({ page }) => {
    await page.goto('/info');
    const rows = page.locator('[data-experience] li');
    await expect(rows).toHaveCount(site.experience.length);
    const first = site.experience[0];
    await expect(rows.first()).toContainText(first.label);
    if (first.period) await expect(rows.first()).toContainText(first.period);
    await expect(rows.last()).toContainText(site.experience.at(-1)!.label);
  });

  test('lists tools from Notion', async ({ page }) => {
    await page.goto('/info');
    const tools = page.locator('[data-tools] li');
    await expect(tools).toHaveText(site.skills.software);
  });

  test('shows email and Instagram but never a phone number', async ({ page }) => {
    await page.goto('/info');
    // Phone is hidden by default (config.showPhone = false); no Korean phone pattern may appear.
    expect(await page.locator('body').innerText()).not.toMatch(/0\d{1,2}-\d{3,4}-\d{4}/);
    test.skip(!site.contact.email || !site.contact.instagram, 'contact not in Notion');
    await expect(page.locator('main').getByRole('link', { name: site.contact.email! })).toHaveAttribute('href', `mailto:${site.contact.email}`);
    const ig = page.locator('main').getByRole('link', { name: site.contact.instagram!.handle });
    await expect(ig).toHaveAttribute('href', site.contact.instagram!.url);
    await expect(ig).toHaveAttribute('target', '_blank');
    await expect(ig).toHaveAttribute('rel', /noopener/);
  });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('/info');
    await expectNoHorizontalScroll(page);
  });
});

test('old /about links land on /info', async ({ page }) => {
  await page.goto('/about');
  await expect(page).toHaveURL(/\/info\/?$/);
});
