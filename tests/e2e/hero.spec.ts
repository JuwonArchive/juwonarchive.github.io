import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { trackErrors } from './helpers';

test.describe('home orbit diagram (2D)', () => {
  test('shows the orbit diagram behind the name and no WebGL canvas', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('[data-orbit]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    const z = await page.evaluate(() => ({
      bloom: Number(getComputedStyle(document.querySelector('.hero-slot')!).zIndex),
      name: Number(getComputedStyle(document.querySelector('h1')!).zIndex),
    }));
    expect(z.bloom).toBeLessThan(z.name);
    expect(errors).toEqual([]);
  });

  test('the shells turn, and stay still with reduced motion', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('[data-orbit] .shell').first().evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    expect(await page.locator('[data-orbit] .shell').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test('one shell per archive, its electrons carrying that work\'s English tool tags', async ({ page }) => {
  await page.goto('/');
  const shells = page.locator('[data-orbit] .shell');
  await expect(shells).toHaveCount(site.works.length);
  for (const [i, w] of site.works.entries()) {
    const ascii = w.tags.filter((t) => /^[\x20-\x7E]+$/.test(t)).slice(0, 8);
    await expect(shells.nth(i).locator('[data-electron]')).toHaveCount(Math.max(ascii.length, 1));
    for (const t of ascii) await expect(shells.nth(i).locator('text', { hasText: t })).toHaveCount(1);
  }
});

test.describe('opening animation', () => {
  test('work tiles flicker in, the name rises, then the intro clears', async ({ page }) => {
    await page.goto('/');
    const intro = page.locator('[data-intro]');
    await expect(intro).toBeVisible();
    expect(await intro.locator('img').count()).toBeGreaterThan(3);
    await expect(intro).toBeHidden({ timeout: 4000 });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('nav[data-home-nav] a').first()).toBeVisible();
  });

  test('plays once per visit', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 4000 });
    await page.goto('/archive');
    await page.goto('/');
    await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 300 });
  });

  test('is skipped with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 300 });
  });
});
