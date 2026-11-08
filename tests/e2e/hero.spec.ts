import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { readFileSync } from 'node:fs';

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

/** Turn the sphere (desktop: sweep the pointer; phones turn on their own) until a crossing bursts. */
async function waitForBurst(page: Page, isMobile: boolean) {
  const dots = page.locator('canvas[data-halftone]');
  // A *new* wave: the recorded start of the latest wave changes (waves are frequent now that orbits drift).
  const key = async () => `${await dots.getAttribute('data-last-burst')}|${await dots.getAttribute('data-last-strength')}`;
  const before = await key();
  if (!isMobile) await page.mouse.move(60, 450);
  for (let i = 0; i < 400; i++) {
    if (!isMobile) await page.mouse.move(60 + (i % 100) * 13, 450);
    if ((await key()) !== before) return;
    await page.waitForTimeout(40);
  }
  throw new Error('no burst within 16s');
}

test.describe('home graphics', () => {
  test('JUWON sits under the top bar; a small clock holds the top-right corner', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('[data-orbit]')).toHaveCount(0);
    const vp = page.viewportSize()!;
    const h1 = (await page.locator('h1').boundingBox())!;
    // JUWON sits under the top bar, like ARCHIVE on the archive page (user: phones, then desktop).
    const bar = (await page.locator('.home .top').boundingBox())!;
    expect(h1.y).toBeGreaterThan(bar.y + bar.height + 8);
    expect(h1.y + h1.height).toBeLessThan(vp.height * 0.3);
    const clock = page.locator('[data-visit-clock]');
    await expect(clock).toHaveText(/\d{2}:\d{2}:\d{2}/);
    const c = (await clock.boundingBox())!;
    expect(c.x + c.width).toBeGreaterThan(vp.width * 0.8);
    expect(c.y).toBeLessThan(vp.height * 0.12);
    await expect(page.locator('[data-corner-label]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('at rest the line art is clean: halftone only comes with crossing bursts (user)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const canvas = page.locator('canvas[data-halftone]');
    await expect(canvas).toHaveAttribute('data-form', 'orbit');
    await expect(canvas).toHaveAttribute('data-ink', 'bursts');
    const inked = await canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
      return n / (d.length / 4);
    });
    expect(inked).toBeLessThan(0.001);
  });

  test('markers carry the archive boxes: same numbers and names, and lead to the box (user: 1)', async ({ page, isMobile }) => {
    const site = JSON.parse(readFileSync('src/data/site.json', 'utf8')) as { works: { titleEn: string; slug: string }[] };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const lines = page.locator('canvas[data-trace]');
    expect(await lines.evaluate((c) => getComputedStyle(c).filter)).toBe('none');
    await page.waitForTimeout(400);
    const labels = JSON.parse((await lines.getAttribute('data-labels'))!) as string[];
    expect(labels).toEqual(site.works.map((w, i) => `${String(i + 1).padStart(2, '0')} ${w.titleEn}`.toUpperCase()));
    // Clicking the first marker opens its archive box.
    const hit = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-trace]')!;
      return JSON.parse(c.dataset.hits ?? '[]')[0] as { x: number; y: number };
    });
    test.skip(isMobile, 'tap target checked on desktop');
    await page.mouse.click(hit.x, hit.y);
    await expect(page).toHaveURL(new RegExp(`/archive/${site.works[0].slug}/?$`));
  });

  test('on phones the sphere fits between the top bar and JUWON (user: A on mobile)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
      const b = c.getBoundingClientRect();
      return {
        cy: b.top + Number(c.dataset.cy),
        r: Number(c.dataset.r),
        // Phones: the band runs from the readout (under JUWON) down to the subline.
        top: document.querySelector('[data-readout-m]')!.getBoundingClientRect().bottom,
        h1: document.querySelector('.home .bar')!.getBoundingClientRect().top,
        w: innerWidth,
      };
    });
    expect(g.r).toBeLessThanOrEqual(g.w * 0.3 + 1); // the user picked 25% bigger than the first mock
    expect(g.r).toBeGreaterThan(g.w * 0.27);
    expect(Math.abs(g.cy - (g.top + g.h1) / 2)).toBeLessThan(20); // middle of the free band
    expect(g.cy - g.r).toBeGreaterThan(g.top);
    expect(g.cy + g.r).toBeLessThan(g.h1);
  });

  test('dot sizes vary continuously within a burst (not one size)', async ({ page, isMobile }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    await waitForBurst(page, isMobile);
    await page.waitForTimeout(150);
    const sizes = Number(await page.locator('canvas[data-halftone]').getAttribute('data-size-steps'));
    expect(sizes).toBeGreaterThanOrEqual(3);
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
    // A little darker than before (user), still a light screen behind the black lines.
    expect((r + g + b) / 3).toBeGreaterThan(195);
    expect((r + g + b) / 3).toBeLessThan(225);
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

  test('pointer up shows the top of the sphere as clearly as pointer down shows the bottom (user)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer');
    await page.goto('/');
    const tilt = () => page.locator('canvas[data-halftone]').evaluate((c: HTMLCanvasElement) => Number(c.dataset.tilt));
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, 2, { steps: 4 });
    await expect.poll(tilt, { timeout: 6000 }).toBeLessThan(-0.5); // looking from above
    const top = await tilt();
    await page.mouse.move(vp.width / 2, vp.height - 2, { steps: 4 });
    await expect.poll(tilt, { timeout: 6000 }).toBeGreaterThan(0.65); // looking from below
    const bottom = await tilt();
    // About as far from edge-on (0) either way.
    expect(Math.abs(Math.abs(top) - Math.abs(bottom))).toBeLessThan(0.25);
  });

  test('on phones a finger drag turns and tilts the sphere (user)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await page.goto('/');
    await page.waitForTimeout(2800);
    const dots = page.locator('canvas[data-halftone]');
    const state = () => dots.evaluate((c: HTMLCanvasElement) => ({ tilt: Number(c.dataset.tilt), yaw: Number(c.dataset.pose!.split(',')[0]) }));
    const drag = (x0: number, y0: number, x1: number, y1: number) =>
      page.evaluate(
        async ([x0, y0, x1, y1]) => {
          const at = (type: string, x: number, y: number) =>
            document.querySelector('main')!.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
          at('pointerdown', x0, y0);
          for (let i = 1; i <= 10; i++) {
            at('pointermove', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
            await new Promise((r) => setTimeout(r, 16));
          }
          at('pointerup', x1, y1);
        },
        [x0, y0, x1, y1] as const,
      );
    // Drag up: tilts towards the bottom view…
    const t0 = (await state()).tilt;
    await drag(200, 600, 200, 250);
    await expect.poll(async () => (await state()).tilt, { timeout: 5000 }).toBeGreaterThan(Math.min(t0 + 0.6, 0.7)); // up to the bottom-view limit
    // …drag down: tilts towards the top view, past edge-on.
    const t1 = (await state()).tilt;
    await drag(200, 250, 200, 600);
    await expect.poll(async () => (await state()).tilt, { timeout: 5000 }).toBeLessThan(Math.min(t1 - 0.6, -0.2));
    // Drag sideways: it turns.
    const mid = await state();
    await drag(80, 400, 320, 400);
    await expect.poll(async () => Math.abs((await state()).yaw - mid.yaw), { timeout: 5000 }).toBeGreaterThan(0.8);
    // The home itself does not scroll or zoom under the finger.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('main.home')!).touchAction)).toBe('none');
  });

  test('each orbit drifts on its own, so crossings keep moving (user)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    const read = () =>
      page.locator('canvas[data-halftone]').evaluate((c: HTMLCanvasElement) => c.dataset.orbitDrift!.split(' ').map((o) => o.split('/').map(Number)));
    const a = await read();
    await page.waitForTimeout(3000);
    const b = await read();
    const moved = a.map((o, i) => Math.abs(b[i][0] - o[0]) + Math.abs(b[i][1] - o[1]));
    for (const m of moved) expect(m).toBeGreaterThan(0.02); // every orbit moves…
    // …each at its own pace and way: the planes precess at different rates (signed), so compare those.
    const spin = a.map((o, i) => b[i][1] - o[1]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.abs(spin[i] - spin[j])).toBeGreaterThan(0.01);
  });

  test('axes run on to the edges and a live readout fills the empty space, fitted to desktop and phones (user)', async ({ page, isMobile }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const readout = page.locator('[data-readout]');
    if (isMobile) {
      // Phones (user): no axes; the readout splits across the top, a clear gap under JUWON, above the sphere.
      await expect(readout).toBeHidden();
      await expect(page.locator('canvas[data-trace]')).not.toHaveAttribute('data-axes', 'extended');
      const rm = page.locator('[data-readout-m]');
      await expect(rm).toBeVisible();
      await expect(rm).toContainText(/CROSSINGS \d\d\s+WAVES \d\d/);
      await expect(rm).toContainText(/YAW .*\s+PITCH/);
      // Mock D (user): two lines each, counts flush left and view angles flush right, like the top bar.
      const cols = await rm.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const [a, b] = [...el.querySelectorAll('span')].map((s) => s.getBoundingClientRect());
        return { h: box.height, l: a.left - box.left, r: box.right - b.right, gap: b.left - a.right, top: Math.abs(a.top - b.top) };
      });
      expect(cols.h).toBeLessThan(32);
      expect(cols.l).toBeLessThan(1);
      expect(cols.r).toBeLessThan(1);
      expect(cols.gap).toBeGreaterThan(40);
      expect(cols.top).toBeLessThan(1);
      const r = (await rm.boundingBox())!;
      const bar = (await page.locator('.home .top').boundingBox())!;
      const sphereTop = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
        return c.getBoundingClientRect().top + Number(c.dataset.cy) - Number(c.dataset.r);
      });
      expect(r.y - (bar.y + bar.height)).toBeGreaterThanOrEqual(12);
      // ...and under JUWON, which now sits under the top bar (user).
      const name = (await page.locator('.home h1').boundingBox())!;
      expect(r.y - (name.y + name.height)).toBeGreaterThanOrEqual(12);
      expect(r.y + r.height).toBeLessThan(sphereTop - 12);
      return;
    }
    await expect(page.locator('[data-readout-m]')).toBeHidden();
    await expect(page.locator('canvas[data-trace]')).toHaveAttribute('data-axes', 'extended');
    await expect(readout).toBeVisible();
    // Live: the orbit values change as the orbits drift.
    const first = await readout.locator('[data-ro="o0"]').textContent();
    expect(first).toMatch(/TILT\s?−?\d\.\d\d\s+SPIN/);
    await expect.poll(() => readout.locator('[data-ro="o0"]').textContent(), { timeout: 6000 }).not.toBe(first);
    // It sits right of the sphere, clear of it and above the horizontal axis.
    const box = (await readout.boundingBox())!;
    const g = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
      const b = c.getBoundingClientRect();
      return { right: b.left + Number(c.dataset.cx) + Number(c.dataset.r), axis: b.top + Number(c.dataset.cy) };
    });
    expect(box.x).toBeGreaterThan(g.right + 40);
    expect(box.y + box.height).toBeLessThan(g.axis);
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

test('no background micro-dots; smaller max dots; paler colour (user)', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const c = page.locator('canvas[data-halftone]');
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  expect(Number(await c.getAttribute('data-max-r'))).toBeLessThanOrEqual(3.5);
  // Phones go finer (0.6px) to match their small sphere (user).
  expect(Number(await c.getAttribute('data-min-r'))).toBeGreaterThanOrEqual(isMobile ? 0.5 : 1);
  const color = (await c.getAttribute('data-dot-color'))!;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  expect((r + g + b) / 3).toBeLessThan(225); // a little darker (user)
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

test('graphic is centred on both axes on desktop, a little smaller (user: B)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones fit the sphere above JUWON');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const r = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
    const b = c.getBoundingClientRect();
    return { x: b.left + Number(c.dataset.cx), y: b.top + Number(c.dataset.cy), r: Number(c.dataset.r), w: innerWidth, h: innerHeight };
  });
  expect(Math.abs(r.x - r.w / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y - r.h / 2)).toBeLessThanOrEqual(1);
  expect(r.r).toBeLessThanOrEqual(Math.min(r.w * 0.17, r.h * 0.28) + 1);
});

const juwonBox = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const h1 = document.querySelector('.home h1')!;
    const range = document.createRange();
    range.selectNodeContents(h1);
    const b = range.getBoundingClientRect();
    const sub = document.querySelector('[data-subline]')!.getBoundingClientRect();
    return { left: b.left, right: b.right, bottom: b.bottom, mid: b.left + b.width / 2, vw: document.documentElement.clientWidth, subLeft: sub.left, subTop: sub.top };
  });

test('phones: JUWON is big and centred, under the top bar (user)', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('/');
  await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 4000 });
  const r = await juwonBox(page);
  expect(Math.abs(r.mid - r.vw / 2)).toBeLessThan(6);
  expect(r.right - r.left).toBeGreaterThan(r.vw * 0.8);
});

test('desktop: smaller JUWON sits top-left under the top bar, clear of the sphere (user)', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto('/');
  await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 4000 });
  const r = await juwonBox(page);
  expect(Math.abs(r.left - r.subLeft)).toBeLessThan(12);
  expect(r.right - r.left).toBeLessThan(r.vw * 0.42);
  expect(r.right - r.left).toBeGreaterThan(r.vw * 0.33); // a little bigger than before (user)
  const bar = (await page.locator('.home .top').boundingBox())!;
  expect(r.bottom).toBeLessThan(bar.y + bar.height + 180);
  // The sphere's outline stays below the name.
  const sphereTop = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
    return c.getBoundingClientRect().top + Number(c.dataset.cy) - Number(c.dataset.r);
  });
  expect(sphereTop).toBeGreaterThan(r.bottom);
});

test('phones use smaller halftone dots (user)', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const dots = page.locator('canvas[data-halftone]');
  // The phone sphere is small, so its dots and spacing are finer than desktop's (user).
  expect(Number(await dots.getAttribute('data-max-r'))).toBeLessThanOrEqual(1.6);
  expect(Number(await dots.getAttribute('data-pitch'))).toBeLessThan(7);
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

/** Samples halftone ink in 20px windows along a line left of (x, y), every `every` ms for `ms`,
 *  re-sending pointermove at (x, y) so the hover never goes idle. Returns one profile per snapshot. */
async function sampleProfiles(page: Page, x: number, y: number, ms: number, every = 100) {
  return page.evaluate(
    ([x, y, ms, every]) =>
      new Promise<number[][]>((resolve) => {
        const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!;
        const ctx = c.getContext('2d')!;
        const k = c.width / c.clientWidth;
        const ink = (cx: number) => {
          const d = ctx.getImageData((cx - 10) * k, (y - 10) * k, 20 * k, 20 * k).data;
          let a = 0;
          for (let i = 3; i < d.length; i += 4) a += d[i];
          return a / (d.length / 4);
        };
        const out: number[][] = [];
        const t0 = performance.now();
        const id = setInterval(() => {
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
          const row: number[] = [];
          for (let d = 0; d <= 130; d += 10) row.push(ink(x - d));
          out.push(row);
          if (performance.now() - t0 > ms) {
            clearInterval(id);
            resolve(out);
          }
        }, every);
      }),
    [x, y, ms, every] as const,
  );
}

test.describe('hover halftone (user)', () => {
  test.skip(({ isMobile }) => isMobile, 'pointer');
  // Empty area right of the sphere, so only the hover draws dots.
  const spot = (page: Page) => ({ x: page.viewportSize()!.width * 0.86, y: page.viewportSize()!.height * 0.3 });

  test('a tight spot that fades out smoothly; narrow band along the orbits', async ({ page }) => {
    await page.goto('/');
    const dots = page.locator('canvas[data-halftone]');
    expect(Number(await dots.getAttribute('data-reveal'))).toBeLessThanOrEqual(40);
    expect(Number(await dots.getAttribute('data-band'))).toBeLessThanOrEqual(5);
    const { x, y } = spot(page);
    await page.mouse.move(x, y, { steps: 4 });
    await expect.poll(() => inkAround(page, x, y, 8), { timeout: 15_000 }).toBeGreaterThan(20);
    // Average over one ripple period so the travelling ring smooths out; what remains is the spot's falloff.
    const period = Number(await dots.getAttribute('data-ripple')) * 1000;
    const rows = await sampleProfiles(page, x, y, period);
    const profile = rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
    for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeLessThanOrEqual(profile[i - 1] * 1.15 + 1);
    for (let i = 1; i < profile.length; i++) expect(profile[i - 1] - profile[i]).toBeLessThan(profile[0] * 0.45);
    expect(profile[11]).toBeLessThan(profile[0] * 0.08);
  });

  test('ripples spread out from the pointer at a steady interval', async ({ page }) => {
    await page.goto('/');
    const { x, y } = spot(page);
    await page.mouse.move(x, y, { steps: 4 });
    await expect.poll(() => inkAround(page, x, y, 8), { timeout: 15_000 }).toBeGreaterThan(20);
    const period = Number(await page.locator('canvas[data-halftone]').getAttribute('data-ripple'));
    expect(period).toBeGreaterThan(0.8);
    expect(period).toBeLessThan(3);
    // 60px out, past the spot's core: ink rises as each ring passes and falls between rings.
    const at60 = (await sampleProfiles(page, x, y, period * 2000, 60)).map((r) => r[6]);
    expect(Math.max(...at60)).toBeGreaterThan(Math.min(...at60) * 1.6 + 2);
  });

  test('fades away when the pointer rests, and comes back when it moves', async ({ page }) => {
    await page.goto('/');
    const dots = page.locator('canvas[data-halftone]');
    const { x, y } = spot(page);
    await page.mouse.move(x, y, { steps: 4 });
    await expect.poll(() => inkAround(page, x, y, 8), { timeout: 15_000 }).toBeGreaterThan(20);
    const idle = Number(await dots.getAttribute('data-idle'));
    expect(idle).toBeGreaterThanOrEqual(1000);
    expect(idle).toBeLessThanOrEqual(4000);
    // Still visible shortly after the last move.
    await page.waitForTimeout(idle * 0.5);
    expect(Number(await dots.getAttribute('data-hover'))).toBeGreaterThan(0.8);
    // Gone after resting.
    await expect.poll(async () => Number(await dots.getAttribute('data-hover')), { timeout: idle + 4000 }).toBeLessThan(0.05);
    expect(await inkAround(page, x, y, 8)).toBeLessThan(3);
    // Moving again brings it back.
    await page.mouse.move(x - 4, y + 2, { steps: 2 });
    await expect.poll(() => inkAround(page, x - 4, y + 2, 8), { timeout: 5000 }).toBeGreaterThan(20);
  });
});

test('crossings burst along both lines and vanish; rare, at most two at once (user)', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const dots = page.locator('canvas[data-halftone]');
  await waitForBurst(page, isMobile);
  const ink = () =>
    dots.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
      return n;
    });
  // Bursts out…
  await expect.poll(ink, { timeout: 2000 }).toBeGreaterThan(40);
  let most = 0;
  for (let i = 0; i < 20; i++) {
    most = Math.max(most, Number(await dots.getAttribute('data-bursts')));
    await page.waitForTimeout(50);
  }
  expect(most).toBeLessThanOrEqual(2); // rarer (user)
  // …and vanishes once the bursts are over (stop turning the sphere first).
  if (!isMobile) await page.mouse.move(1300, 450);
  await expect.poll(async () => Number(await dots.getAttribute('data-bursts')), { timeout: 10_000 }).toBe(0);
});

test('burst dots fade: lighter as well as smaller away from the crossing (user)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'measured on desktop dots');
  await page.goto('/');
  await page.waitForTimeout(2500);
  await waitForBurst(page, false);
  await page.waitForTimeout(180);
  // Each dot's size and opacity straight from the canvas: bigger dots must be more opaque.
  const pairs = await page.locator('canvas[data-halftone]').evaluate((c: HTMLCanvasElement) => {
    const { data, width, height } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const seen = new Uint8Array(width * height);
    const out: [number, number][] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (seen[i] || data[i * 4 + 3] < 8) continue;
        let area = 0;
        let peak = 0;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const k = stack.pop()!;
          area++;
          peak = Math.max(peak, data[k * 4 + 3]);
          for (const n of [k - 1, k + 1, k - width, k + width])
            if (n >= 0 && n < width * height && !seen[n] && data[n * 4 + 3] >= 8) {
              seen[n] = 1;
              stack.push(n);
            }
        }
        if (area < 400) out.push([area, peak]);
      }
    return out;
  });
  expect(pairs.length).toBeGreaterThan(10);
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const q = Math.floor(sorted.length / 4);
  const avg = (xs: [number, number][]) => xs.reduce((s, p) => s + p[1], 0) / xs.length;
  expect(avg(sorted.slice(-q))).toBeGreaterThan(avg(sorted.slice(0, q)) * 1.3);
});

test('a burst travels like a wave: it starts at the crossing and the middle clears first (user)', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const dots = page.locator('canvas[data-halftone]');
  // Sample, inside the page, the ink right at the crossing and the total ink, every animation frame.
  if (!isMobile) await page.mouse.move(60, 450);
  // Keep turning the sphere until the first burst (stops itself once one has happened).
  if (!isMobile) page.evaluate(async () => { const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!; for (let i = 0; i < 300 && !Number(c.dataset.bursts); i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60 + (i % 100) * 13, clientY: 450 })); await new Promise((r) => setTimeout(r, 50)); } }).catch(() => {});
  const series = await dots.evaluate(async (c: HTMLCanvasElement) => {
    // Wait for a new wave to start (its recorded start changes).
    const start = `${c.dataset.lastBurst}|${c.dataset.lastStrength}`;
    for (let i = 0; i < 1500; i++) {
      if (`${c.dataset.lastBurst}|${c.dataset.lastStrength}` !== start) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const [bx, by] = (c.dataset.lastBurst ?? '0,0').split(',').map(Number);
    const k = c.width / c.clientWidth;
    const ink = (x: number, y: number, half: number) => {
      const d = c.getContext('2d')!.getImageData((x - half) * k, (y - half) * k, half * 2 * k, half * 2 * k).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a / (d.length / 4);
    };
    const out: { t: number; centre: number }[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      out.push({ t: performance.now() - t0, centre: ink(bx, by, 10) });
      await new Promise((r) => setTimeout(r, 40));
    }
    return out;
  });
  const peak = Math.max(...series.filter((s) => s.t < 400).map((s) => s.centre));
  const late = series.filter((s) => s.t > 800).map((s) => s.centre);
  expect(peak).toBeGreaterThan(1);
  // The middle has emptied while the wave is still out on the lines.
  expect(Math.max(...late)).toBeLessThan(peak * 0.35);
});

test('a wave spreads slowly and its dots shrink gradually, not only at the end (user)', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  if (!isMobile) await page.mouse.move(60, 450);
  if (!isMobile) page.evaluate(async () => { const c = document.querySelector<HTMLCanvasElement>('canvas[data-halftone]')!; for (let i = 0; i < 300 && !Number(c.dataset.bursts); i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60 + (i % 100) * 13, clientY: 450 })); await new Promise((r) => setTimeout(r, 50)); } }).catch(() => {});
  const series = await page.locator('canvas[data-halftone]').evaluate(async (c: HTMLCanvasElement) => {
    // Wait for a new wave to start (its recorded start changes).
    const start = `${c.dataset.lastBurst}|${c.dataset.lastStrength}`;
    for (let i = 0; i < 1500; i++) {
      if (`${c.dataset.lastBurst}|${c.dataset.lastStrength}` !== start) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const out: { t: number; dot: number; bursts: number }[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2200) {
      out.push({ t: performance.now() - t0, dot: Number(c.dataset.burstDotMean), bursts: Number(c.dataset.bursts) });
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  });
  // Still going after a second (slow), and gone by ~2s.
  expect(series.some((s) => s.t > 1100 && s.bursts > 0)).toBe(true);
  // Mean dot size falls step by step: start > middle > late.
  const mean = (a: number, b: number) => {
    const xs = series.filter((s) => s.t >= a && s.t < b && s.dot > 0).map((s) => s.dot);
    return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : NaN;
  };
  const start = mean(0, 300);
  const middle = mean(600, 900);
  const late = mean(1200, 1500);
  expect(start).toBeGreaterThan(middle);
  if (!Number.isNaN(late)) expect(middle).toBeGreaterThan(late);
});
