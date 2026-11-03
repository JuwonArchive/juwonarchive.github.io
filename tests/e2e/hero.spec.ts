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

test('tool labels never sit on top of their dot, at any point in the rotation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-intro]')).toBeHidden({ timeout: 4000 });
  for (const progress of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    // Jump every running animation to the same fraction of its cycle.
    await page.evaluate((p) => {
      for (const a of document.getAnimations()) {
        const d = Number(a.effect?.getTiming().duration) || 0;
        if (d) a.currentTime = d * p;
        a.pause();
      }
    }, progress);
    const hits = await page.locator('[data-electron]').evaluateAll((els) =>
      els.flatMap((el) => {
        const dot = el.querySelector('circle')!.getBoundingClientRect();
        const text = el.querySelector('text');
        if (!text || !text.textContent) return [];
        const t = text.getBoundingClientRect();
        const overlap = !(t.right < dot.left || t.left > dot.right || t.bottom < dot.top || t.top > dot.bottom);
        return overlap ? [text.textContent] : [];
      }),
    );
    expect(hits, `at ${progress * 100}% of the cycle`).toEqual([]);
  }
});

test.describe('core sphere', () => {
  test('has no outline ring, is shaded like a sphere, and keeps shimmering', async ({ page }) => {
    await page.goto('/');
    const orbit = page.locator('[data-orbit]');
    await expect(orbit.locator('.nucleus')).toHaveCount(0);
    await expect(orbit.locator('[data-sphere]')).toHaveCount(1);
    // Sphere shading: an off-centre highlight in the body gradient.
    const fx = await orbit.locator('#sphere-body').getAttribute('fx');
    expect(Number.parseFloat(fx!)).toBeLessThan(50);
    // Liquid wobble + colour drift run as SVG animations.
    expect(await orbit.locator('[data-sphere] animate, #wobble animate').count()).toBeGreaterThan(2);
    expect(await orbit.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  });

  test('stops completely with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.locator('[data-orbit]').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  });
});
