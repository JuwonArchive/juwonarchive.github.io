import { test, expect } from '@playwright/test';
import site from '../../src/data/site.json' with { type: 'json' };
import { trackErrors } from './helpers';

test.describe('chrome hero', () => {
  test('renders a WebGL canvas', async ({ page }, info) => {
    test.skip(info.project.name === 'no-webgl');
    const errors = trackErrors(page);
    await page.goto('/');
    const canvas = page.locator('canvas#chrome-hero');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);
    await expect(canvas).toHaveAttribute('data-ready', '');
    await expect(page.locator('img[src="/chrome-fallback.webp"]')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('stays still with reduced motion', async ({ page }, info) => {
    test.skip(info.project.name === 'no-webgl');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const canvas = page.locator('canvas#chrome-hero');
    await expect(canvas).toHaveAttribute('data-ready', '');
    await page.waitForTimeout(300);
    const a = await canvas.screenshot();
    await page.waitForTimeout(500);
    const b = await canvas.screenshot();
    expect(a.equals(b)).toBe(true);
  });

  test('falls back to a still image without WebGL', async ({ page }, info) => {
    test.skip(info.project.name !== 'no-webgl');
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('img[src="/chrome-fallback.webp"]')).toBeVisible();
    await expect(page.locator('canvas#chrome-hero')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
