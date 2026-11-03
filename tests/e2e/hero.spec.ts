import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

/** Mean alpha of the halftone canvas in a square around (x, y) in CSS px. */
async function inkAround(page: Page, x: number, y: number, half = 40) {
  return page.locator('canvas[data-halftone]').evaluate(
    (c: HTMLCanvasElement, [x, y, half]) => {
      const k = c.width / c.clientWidth;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData((x - half) * k, (y - half) * k, half * 2 * k, half * 2 * k).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a / (d.length / 4);
    },
    [x, y, half],
  );
}

test.describe('home graphics', () => {
  test('orbit diagram is gone; JUWON sits at the top', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('[data-orbit]')).toHaveCount(0);
    const top = (await page.locator('h1').boundingBox())!.y;
    expect(top).toBeLessThan(page.viewportSize()!.height * 0.25);
    expect(errors).toEqual([]);
  });

  test('a dense halftone in the display colour fills the space', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas[data-halftone]');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.width * box.height).toBeGreaterThan(vp.width * vp.height * 0.5);
    expect(Number(await canvas.getAttribute('data-pitch'))).toBeLessThanOrEqual(16);
    await expect(canvas).toHaveAttribute('data-color', '#dae0e5');
    // Something is actually drawn across the canvas.
    expect(await inkAround(page, box.x + box.width / 2, box.y + box.height / 2, 120)).toBeGreaterThan(20);
  });

  test('the field clears behind JUWON so the name reads', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const h1 = (await page.locator('h1').boundingBox())!;
    const behind = await inkAround(page, h1.x + h1.width / 2, h1.y + h1.height / 2, 30);
    const open = await inkAround(page, h1.x + h1.width / 2, h1.y + h1.height + 200, 30);
    expect(behind).toBeLessThan(open * 0.15);
  });

  test('dots swell around the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const box = (await page.locator('canvas[data-halftone]').boundingBox())!;
    const x = box.x + box.width * 0.75;
    const y = box.y + box.height * 0.6;
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    const before = await inkAround(page, x, y);
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(700);
    const after = await inkAround(page, x, y);
    expect(after).toBeGreaterThan(before * 1.25);
  });

  test('fog of the four palette colours drifts and follows the pointer', async ({ page, isMobile }) => {
    await page.goto('/');
    const layers = page.locator('[data-fog] [data-fog-layer]');
    expect(await layers.count()).toBe(4);
    const colours = await layers.evaluateAll((els) => els.map((e) => e.getAttribute('data-fog-layer')));
    expect(new Set(colours)).toEqual(new Set(['#f0faff', '#49c2ff', '#4963fd', '#443be3']));
    expect(await layers.first().evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
    if (!isMobile) {
      const fog = page.locator('[data-fog]');
      await page.mouse.move(10, 10);
      await page.waitForTimeout(600);
      const a = await fog.evaluate((el) => getComputedStyle(el).getPropertyValue('--mx'));
      await page.mouse.move(1200, 700, { steps: 6 });
      await page.waitForTimeout(600);
      const b = await fog.evaluate((el) => getComputedStyle(el).getPropertyValue('--mx'));
      expect(a).not.toBe(b);
    }
  });

  test('everything holds still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.locator('[data-fog] [data-fog-layer]').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.locator('canvas[data-halftone]')).toHaveAttribute('data-static', '');
  });
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
