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

  test('orbit line art rendered through a halftone screen', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const canvas = page.locator('canvas[data-halftone]');
    await expect(canvas).toHaveAttribute('data-form', 'orbit');
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
          if (mean > 40) dense++;
          else if (mean > 22 && c.clientWidth < 768) dense++; // phones use smaller dots (user)
        }
      return { inked: inked / total, dense: dense / total };
    });
    expect(share.inked).toBeGreaterThan(0.1);
    expect(share.inked).toBeLessThan(0.75);
    // Variant ③: at rest the halftone is faint along the orbits (no dense areas required);
    // the pointer test below covers the reveal.
  });

  test('crisp line art on top carries tool-name labels', async ({ page }) => {
    await page.goto('/');
    const lines = page.locator('canvas[data-trace]');
    expect(await lines.evaluate((c) => getComputedStyle(c).filter)).toBe('none');
    await page.waitForTimeout(600);
    const labels = JSON.parse((await lines.getAttribute('data-labels'))!) as string[];
    expect(labels.length).toBeGreaterThanOrEqual(5);
    for (const l of labels) expect(l).toMatch(/^[\x20-\x7E]+$/);
    expect(labels.map((l) => l.toUpperCase())).toContain('BLENDER');
  });

  test('on phones the sphere sits in the vertical middle (user)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const cy = Number(await page.locator('canvas[data-halftone]').getAttribute('data-cy'));
    const h = page.viewportSize()!.height;
    expect(Math.abs(cy - h / 2)).toBeLessThan(h * 0.05);
  });

  test('dot sizes vary continuously (not one size)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const sizes = Number(await page.locator('canvas[data-halftone]').getAttribute('data-size-steps'));
    // Phones span 1–2.4px (user asked for smaller dots), so fewer quarter-pixel steps exist.
    // At rest (variant ③) sizes still vary along the orbits, over a narrower range.
    expect(sizes).toBeGreaterThanOrEqual(5);
  });

  test('dots swell around the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer');
    await page.goto('/');
    const vp = page.viewportSize()!;
    const x = vp.width * 0.88;
    const y = vp.height * 0.25;
    await page.mouse.move(5, vp.height - 5);
    await page.waitForTimeout(500);
    const before = await inkAround(page, x, y, 50);
    await page.mouse.move(x, y, { steps: 6 });
    // Frames can be slow under parallel test load; wait for the eased pointer to arrive.
    await expect.poll(() => inkAround(page, x, y, 50), { timeout: 15_000 }).toBeGreaterThan(before * 2);
  });

  test('light colour, sphere wireframe and dotted guides on the line layer', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(400);
    const lines = page.locator('canvas[data-trace]');
    await expect(lines).toHaveAttribute('data-wire', 'latlong');
    expect(Number(await lines.getAttribute('data-dotted'))).toBeGreaterThanOrEqual(4);
    const color = (await page.locator('canvas[data-halftone]').getAttribute('data-dot-color'))!;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    expect((r + g + b) / 3).toBeGreaterThan(215); // paler again (user)
  });

  test('the artwork may run behind JUWON (no cut-off zone)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'on phones the sphere is centred (user)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const h1 = (await page.locator('h1').boundingBox())!;
    let ink = 0;
    for (const fx of [0.3, 0.5, 0.7]) ink += await inkAround(page, h1.x + h1.width * fx, h1.y + h1.height * 0.2, 40);
    expect(ink).toBeGreaterThan(3);
  });

  test('the orbits turn toward the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer');
    await page.goto('/');
    const snap = () => page.locator('canvas[data-halftone]').evaluate((c: HTMLCanvasElement) => c.dataset.pose);
    await page.mouse.move(40, 40, { steps: 4 });
    await page.waitForTimeout(900);
    const a = await snap();
    await page.mouse.move(1300, 800, { steps: 8 });
    await page.waitForTimeout(900);
    expect(await snap()).not.toBe(a);
  });

  test('no background fog: plain white page', async ({ page }) => {
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
    // The intro is ~2 s; on a slow machine it can finish before we look, so check it was armed.
    await expect(page.locator('html')).toHaveClass(/\bintro\b/);
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


test('home artwork is light enough to animate smoothly', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 1840, height: 880 });
  await page.goto('/');
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const ts: number[] = [];
        const f = (t: number) => {
          ts.push(t);
          if (ts.length < 60) requestAnimationFrame(f);
          else res((ts.length - 1) / ((ts.at(-1)! - ts[0]) / 1000));
        };
        requestAnimationFrame(f);
      }),
  );
  expect(fps).toBeGreaterThan(20);
  // No GPU readback in the render loop.
  expect(await page.locator('canvas[data-halftone]').getAttribute('data-readback')).toBe('none');
});

test('graphic is horizontally centred on desktop (user)', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const cx = Number(await page.locator('canvas[data-halftone]').getAttribute('data-cx'));
  expect(Math.abs(cx - page.viewportSize()!.width / 2)).toBeLessThan(2);
});

test('no background micro-dots; smaller max dots; paler colour (user)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const c = page.locator('canvas[data-halftone]');
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  expect(Number(await c.getAttribute('data-max-r'))).toBeLessThanOrEqual(3.5);
  expect(Number(await c.getAttribute('data-min-r'))).toBeGreaterThanOrEqual(1);
  const color = (await c.getAttribute('data-dot-color'))!;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  expect((r + g + b) / 3).toBeGreaterThan(228);
});

test('halftone has a very slight blur (user)', async ({ page }) => {
  await page.goto('/');
  // Blur is baked into pre-rendered dot stamps (no per-frame full-screen filter).
  const c = page.locator('canvas[data-halftone]');
  expect(await c.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  const px = Number(await c.getAttribute('data-blur'));
  expect(px).toBeGreaterThan(0.2);
  expect(px).toBeLessThanOrEqual(0.8);
});

test('graphic is centred on both axes, desktop and phone (user)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const r = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
    const b = c.getBoundingClientRect();
    return { x: b.left + Number(c.dataset.cx), y: b.top + Number(c.dataset.cy), w: innerWidth, h: innerHeight };
  });
  expect(Math.abs(r.x - r.w / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y - r.h / 2)).toBeLessThanOrEqual(1);
});

test('JUWON is centred (user)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 4000 });
  const r = await page.evaluate(() => {
    const h1 = document.querySelector('.home h1')!;
    const range = document.createRange();
    range.selectNodeContents(h1);
    const b = range.getBoundingClientRect();
    return { mid: b.left + b.width / 2, vw: document.documentElement.clientWidth };
  });
  expect(Math.abs(r.mid - r.vw / 2)).toBeLessThan(6);
});

test('phones use smaller halftone dots (user)', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(Number(await page.locator('canvas[data-halftone]').getAttribute('data-max-r'))).toBeLessThanOrEqual(2.5);
});

test('tighter halftone spacing; darker orbit lines and labels (user)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const dots = page.locator('canvas[data-halftone]');
  expect(Number(await dots.getAttribute('data-pitch'))).toBeLessThanOrEqual(7);
  // Dots never touch: diameter stays under the spacing.
  expect(Number(await dots.getAttribute('data-max-r')) * 2).toBeLessThan(Number(await dots.getAttribute('data-pitch')));
  const lines = page.locator('canvas[data-trace]');
  expect(Number(await lines.evaluate((c) => getComputedStyle(c).opacity))).toBeGreaterThanOrEqual(0.85);
  expect(Number(await lines.getAttribute('data-line-alpha'))).toBeGreaterThanOrEqual(0.8);
});

test('halftone is the subtle variant: faint at rest, revealed by the pointer (user choice ③)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas[data-halftone]')).toHaveAttribute('data-mode', 'subtle');
});
