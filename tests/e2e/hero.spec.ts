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
  test('is a soft-edged glass sphere with flowing bands, a specular rim and a glow', async ({ page }) => {
    await page.goto('/');
    const orbit = page.locator('[data-orbit]');
    await expect(orbit.locator('.nucleus')).toHaveCount(0);
    const sphere = orbit.locator('[data-sphere]');
    await expect(sphere).toHaveCount(1);
    // Soft edge (user request): the body is masked by a blurred circle, with no outline ring.
    await expect(orbit.locator('mask#sphere-edge circle[filter]')).toHaveCount(1);
    await expect(sphere.locator('[data-outline]')).toHaveCount(0);
    expect(await sphere.locator('[data-body]').getAttribute('mask')).toBe('url(#sphere-edge)');
    await expect(sphere.locator('[data-bands]')).toHaveCount(1);
    await expect(sphere.locator('[data-specular]')).toHaveCount(1);
    await expect(sphere.locator('[data-glow]')).toHaveCount(1);
    expect(await sphere.getAttribute('filter')).toBeNull();
    // Flowing bands run as SVG animations.
    expect(await orbit.locator('animate, animateTransform').count()).toBeGreaterThan(2);
    expect(await orbit.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  });

  test('stops completely with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.locator('[data-orbit]').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  });
});

test('the white crescent reaches well into the sphere (user: stronger white light)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured once at desktop size');
  const { createRequire } = await import('node:module');
  const sharp = createRequire(import.meta.url)('sharp');
  await page.emulateMedia({ reducedMotion: 'reduce' }); // freeze the bands so the measurement is stable
  await page.goto('/');
  const box = (await page.locator('[data-sphere] [data-body]').boundingBox())!;
  const r = box.width / 2;
  const at = async (dx: number, dy: number) => {
    const buf = await page.screenshot({ clip: { x: box.x + r + dx * r - 6, y: box.y + r + dy * r - 6, width: 12, height: 12 } });
    const st = await sharp(buf).stats();
    return (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  };
  expect(await at(0.22, -0.3)).toBeGreaterThanOrEqual(215);
  // The rest of the sphere stays blue.
  expect(await at(-0.2, 0.2)).toBeLessThan(200);
});

test.describe('god rays', () => {
  test('light shafts stream out from the sphere and move', async ({ page }) => {
    await page.goto('/');
    const rays = page.locator('[data-orbit] [data-godrays]');
    await expect(rays).toHaveCount(1);
    expect(await rays.locator('path').count()).toBeGreaterThanOrEqual(8);
    expect(await rays.evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
    // Rays are drawn behind the sphere.
    const order = await page.locator('[data-orbit]').evaluate((svg) => {
      const all = [...svg.querySelectorAll('[data-godrays], [data-sphere]')];
      return all.map((e) => (e.hasAttribute('data-godrays') ? 'rays' : 'sphere'));
    });
    expect(order).toEqual(['rays', 'sphere']);
  });

  test('hold still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.locator('[data-godrays]').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test('god rays stay short and faint (user: natural, not overdone)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const r = await page.locator('[data-orbit]').evaluate((svg) => {
    const rays = svg.querySelector<SVGGElement>('[data-godrays]')!;
    const box = rays.getBBox();
    const reach = Math.max(-box.x, -box.y, box.x + box.width, box.y + box.height);
    const opacities = [...rays.querySelectorAll('path')].map((p) => Number(p.getAttribute('opacity')));
    return { reach, maxOpacity: Math.max(...opacities), count: opacities.length };
  });
  const SPHERE_R = 72;
  expect(r.reach).toBeLessThanOrEqual(SPHERE_R * 2.5);
  expect(r.maxOpacity).toBeLessThanOrEqual(0.45);
  expect(r.count).toBeGreaterThanOrEqual(24);
});
