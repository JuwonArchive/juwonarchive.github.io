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
  test('JUWON sits at the bottom; a small clock holds the top-right corner', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('[data-orbit]')).toHaveCount(0);
    const vp = page.viewportSize()!;
    const h1 = (await page.locator('h1').boundingBox())!;
    expect(h1.y + h1.height).toBeGreaterThan(vp.height * 0.7);
    const clock = page.locator('[data-visit-clock]');
    await expect(clock).toHaveText(/\d{2}:\d{2}:\d{2}/);
    const c = (await clock.boundingBox())!;
    expect(c.x + c.width).toBeGreaterThan(vp.width * 0.8);
    expect(c.y).toBeLessThan(vp.height * 0.12);
    await expect(page.locator('[data-corner-label]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a halftone ribbon artwork in the display colour, not a wallpaper', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const canvas = page.locator('canvas[data-halftone]');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-color', '#dae0e5');
    await expect(canvas).toHaveAttribute('data-form', 'fold');
    // Coverage: some cells are dense, most of the page stays open.
    const share = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const cell = Math.round(60 * (c.width / c.clientWidth));
      let inked = 0;
      let dense = 0;
      let total = 0;
      for (let y = 0; y + cell <= c.height; y += cell)
        for (let x = 0; x + cell <= c.width; x += cell) {
          const d = ctx.getImageData(x, y, cell, cell).data;
          let a = 0;
          for (let i = 3; i < d.length; i += 4) a += d[i];
          const mean = a / (d.length / 4);
          total++;
          if (mean > 8) inked++;
          if (mean > 60) dense++;
        }
      return { inked: inked / total, dense: dense / total };
    });
    expect(share.inked).toBeGreaterThan(0.08);
    expect(share.inked).toBeGreaterThan(0.15); // denser (user)
    expect(share.inked).toBeLessThan(0.6);
    expect(share.dense).toBeGreaterThan(0.02);
  });

  test('the field clears behind JUWON so the name reads', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const h1 = (await page.locator('h1').boundingBox())!;
    for (const fx of [0.2, 0.5, 0.8]) {
      expect(await inkAround(page, h1.x + h1.width * fx, h1.y + h1.height / 2, 30)).toBeLessThan(3);
    }
  });

  test('ribbon dots never merge into each other (user)', async ({ page }) => {
    await page.goto('/');
    // Sample several moments of the twist on desktop and phone.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(700);
      await expect(page.locator('canvas[data-halftone]')).toHaveAttribute('data-overlaps', '0');
    }
  });

  test('the artwork morphs between several forms', async ({ page }) => {
    test.setTimeout(40_000);
    await page.goto('/');
    const canvas = page.locator('canvas[data-halftone]');
    const forms = (await canvas.getAttribute('data-forms'))!.split(',');
    expect(forms.length).toBeGreaterThanOrEqual(4);
    expect(forms).toEqual(expect.arrayContaining(['fold', 'vortex', 'torus', 'bloom'])); // original forms
    const seen = new Set<string>();
    for (let i = 0; i < 22 && seen.size < 2; i++) {
      seen.add((await canvas.getAttribute('data-form'))!);
      await page.waitForTimeout(800);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    await expect(canvas).toHaveAttribute('data-overlaps', '0');
  });

  test('the ribbon turns toward the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer');
    await page.goto('/');
    const snap = () => page.locator('canvas[data-halftone]').evaluate((c: HTMLCanvasElement) => c.dataset.pose);
    await page.mouse.move(40, 40, { steps: 4 });
    await page.waitForTimeout(900);
    const a = await snap();
    await page.mouse.move(1300, 800, { steps: 8 });
    await page.waitForTimeout(900);
    const b = await snap();
    expect(a).toBeTruthy();
    expect(b).not.toBe(a);
  });

  test('no background fog: the page behind the artwork is plain white (user)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-fog]')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
  });

  test('everything holds still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
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

test('halftone has a slight dreamy blur (user)', async ({ page }) => {
  await page.goto('/');
  const f = await page.locator('canvas[data-halftone]').evaluate((c) => getComputedStyle(c).filter);
  const px = Number(f.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
  expect(px).toBeGreaterThan(0.5);
  expect(px).toBeLessThanOrEqual(2.5);
});

test('plotter trace sits on top of the halftone, crisp, with labelled markers that move', async ({ page }) => {
  await page.goto('/');
  const trace = page.locator('canvas[data-trace]');
  await expect(trace).toBeVisible();
  expect(await trace.evaluate((c) => getComputedStyle(c).filter)).toBe('none');
  const z = await page.evaluate(() => [
    Number(getComputedStyle(document.querySelector('canvas[data-trace]')!).zIndex || 0),
    Number(getComputedStyle(document.querySelector('canvas[data-halftone]')!).zIndex || 0),
  ]);
  expect(z[0]).toBeGreaterThan(z[1]);
  await page.waitForTimeout(600);
  const a = await trace.getAttribute('data-labels');
  const labels = JSON.parse(a!) as string[];
  expect(labels.length).toBeGreaterThanOrEqual(8);
  for (const l of labels) expect(l).toMatch(/^\d+ \d+$/);
  await page.waitForTimeout(1500);
  expect(await trace.getAttribute('data-labels')).not.toBe(a);
});

test('plotter path runs one way, straight only, and is light (user)', async ({ page }) => {
  await page.goto('/');
  const trace = page.locator('canvas[data-trace]');
  await page.waitForTimeout(600);
  const xs = (JSON.parse((await trace.getAttribute('data-labels'))!) as string[]).map((l) => Number(l.split(' ')[0]));
  for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
  await expect(trace).toHaveAttribute('data-path', 'straight');
  expect(Number(await trace.evaluate((c) => getComputedStyle(c).opacity))).toBeLessThanOrEqual(0.55);
});
