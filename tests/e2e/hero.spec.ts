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
    // Abstract fluid (user request): soft drifting colour fields, no stripes.
    await expect(sphere.locator('[data-bands]')).toHaveCount(0);
    const fluid = sphere.locator('[data-fluid]');
    await expect(fluid).toHaveCount(1);
    // Palette (user): #F0FAFF, #49C2FF, #4963FD, #443BE3.
    const fills = await fluid.locator('[data-blob]').evaluateAll((els) => els.map((e) => e.getAttribute('fill')!.toLowerCase()));
    expect(new Set(fills)).toEqual(new Set(['#f0faff', '#49c2ff', '#4963fd', '#443be3']));
    expect(await fluid.getAttribute('filter')).toMatch(/url\(#fluid\)/);
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

test('the white reflection is restrained and changes over time (user)', async ({ page }) => {
  await page.goto('/');
  const anim = page.locator('[data-specular] animate[attributeName="opacity"]');
  await expect(anim).toHaveCount(1);
  const values = (await anim.getAttribute('values'))!.split(';').map(Number);
  expect(Math.max(...values)).toBeLessThanOrEqual(0.7);
  expect(Math.min(...values)).toBeLessThanOrEqual(0.25);
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
  expect(r.maxOpacity).toBeLessThanOrEqual(0.85); // brighter (user), still not solid
  expect(r.count).toBeGreaterThanOrEqual(8);
  expect(r.count).toBeLessThanOrEqual(14); // user: fewer shafts
});

test.describe('glow and ray tone', () => {
  const sample = async (page: import('@playwright/test').Page) => {
    const { createRequire } = await import('node:module');
    const sharp = createRequire(import.meta.url)('sharp');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const box = (await page.locator('[data-sphere] [data-body]').boundingBox())!;
    const R = box.width / 2;
    const cx = box.x + R;
    const cy = box.y + R;
    return async (angleDeg: number, k: number) => {
      const a = (angleDeg * Math.PI) / 180;
      const buf = await page.screenshot({ clip: { x: cx + Math.cos(a) * k * R - 4, y: cy + Math.sin(a) * k * R - 4, width: 8, height: 8 } });
      const st = await sharp(buf).stats();
      const [r, g, b] = st.channels.slice(0, 3).map((c: { mean: number }) => c.mean);
      return { r, g, b };
    };
  };

  test('the glow just outside the edge matches the sphere (blue-violet, not cyan)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const at = await sample(page);
    const halo = await at(135, 1.12); // lower-left, away from the rays
    expect(halo.g - halo.r).toBeLessThanOrEqual(15);
    expect(halo.b - halo.g).toBeGreaterThanOrEqual(60);
  });

  test('rays are bright at the root and fade with distance', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const at = await sample(page);
    // Direction of the strongest ray, read from its geometry.
    const angle = await page.locator('[data-godrays] path').evaluateAll((paths) => {
      const best = paths.reduce((a, p) => (Number(p.getAttribute('opacity')) > Number(a.getAttribute('opacity')) ? p : a));
      const n = best.getAttribute('d')!.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const [x, y] = [(n[2] + n[4]) / 2, (n[3] + n[5]) / 2];
      return (Math.atan2(y, x) * 180) / Math.PI;
    });
    const root = await at(angle, 1.15);
    const mid = await at(angle, 1.5);
    expect(root.r).toBeLessThanOrEqual(175); // bright, saturated light at the root
    expect(mid.r - root.r).toBeGreaterThanOrEqual(35); // clearly paler further out
  });
});

test.describe('ray motion and orbit spacing', () => {
  test('each ray reaches out and pulls back on its own rhythm', async ({ page }) => {
    await page.goto('/');
    const timings = await page.locator('[data-godrays] path').evaluateAll((paths) =>
      paths.map((p) => {
        const grow = p.querySelector('animateTransform[type="scale"]');
        return { dur: grow?.getAttribute('dur'), begin: grow?.getAttribute('begin') };
      }),
    );
    expect(timings.every((t) => t.dur && t.begin)).toBe(true);
    expect(new Set(timings.map((t) => t.dur)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(timings.map((t) => t.begin)).size).toBeGreaterThanOrEqual(5);
    expect(await page.locator('[data-orbit]').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  });

  test('rays hold still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.locator('[data-orbit]').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  });

  test('orbits are spaced wider apart (user request)', async ({ page }) => {
    await page.goto('/');
    const radii = await page.locator('[data-orbit] .ring').evaluateAll((rs) => rs.map((r) => Number(r.getAttribute('r'))));
    for (let i = 1; i < radii.length; i++) expect(radii[i] - radii[i - 1]).toBeGreaterThanOrEqual(110);
  });
});

test('sphere is sized in proportion to the orbits', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const body = document.querySelector('[data-sphere] [data-body]')!.getBoundingClientRect();
    const ring = document.querySelector('[data-orbit] .ring')!.getBoundingClientRect();
    return body.width / ring.width;
  });
  // Sphere diameter ≈ 55–70% of the first orbit.
  expect(r).toBeGreaterThanOrEqual(0.55);
  expect(r).toBeLessThanOrEqual(0.7);
});
