/**
 * Halftone field: a dense dot grid whose sizes follow slow interfering waves.
 * Dots swell around the pointer. Draws once (static) for reduced-motion visitors.
 */
export function mountHalftone(
  canvas: HTMLCanvasElement,
  opts: { color: string; pitch: number; reducedMotion: boolean; avoid?: () => Element | null },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  const RADIUS = 150;

  // Clear zone behind the name (in canvas coordinates), so same-coloured letters stay legible.
  let clear: { l: number; t: number; r: number; b: number } | null = null;
  const FADE = 36;
  const measureClear = () => {
    const el = opts.avoid?.();
    if (!el) return (clear = null);
    const c = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    clear = { l: r.left - c.left - 8, t: r.top - c.top - 8, r: r.right - c.left + 8, b: r.bottom - c.top + 8 };
  };
  const clearFactor = (x: number, y: number) => {
    if (!clear) return 1;
    const dx = Math.max(clear.l - x, 0, x - clear.r);
    const dy = Math.max(clear.t - y, 0, y - clear.b);
    const d = Math.hypot(dx, dy);
    return d >= FADE ? 1 : d / FADE;
  };

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    measureClear();
  };

  const field = (x: number, y: number, t: number) => {
    const a = Math.sin(x * 0.0062 + t * 0.32) * Math.cos(y * 0.0081 - t * 0.27);
    const b = Math.sin((x + y) * 0.0041 + t * 0.19);
    const c = Math.cos(Math.hypot(x - w * 0.7, y - h * 0.45) * 0.012 - t * 0.6);
    return Math.min(1, Math.max(0, 0.5 + 0.32 * a + 0.22 * b + 0.18 * c));
  };

  const draw = (t: number) => {
    const p = opts.pitch;
    const max = p * 0.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.color;
    for (let y = p / 2; y < h; y += p) {
      for (let x = p / 2; x < w; x += p) {
        // Every dot keeps a base size so the field reads as dense; the waves modulate the rest.
        let r = max * (0.28 + 0.72 * Math.pow(field(x, y, t), 1.2));
        const d2 = (x - pointer.x) ** 2 + (y - pointer.y) ** 2;
        if (d2 < RADIUS * RADIUS * 4) r *= 1 + 0.9 * Math.exp(-d2 / (2 * RADIUS * RADIUS));
        r = Math.min(r, max * 0.98) * clearFactor(x, y);
        if (r < 0.35) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  resize();
  new ResizeObserver(() => {
    resize();
    if (opts.reducedMotion) draw(0);
  }).observe(canvas);
  // The name animates in on first visit; re-measure once fonts and the intro settle.
  document.fonts?.ready.then(() => {
    measureClear();
    if (opts.reducedMotion) draw(0);
  });
  window.setTimeout(measureClear, 2400);

  if (opts.reducedMotion) {
    canvas.toggleAttribute('data-static', true);
    draw(0);
    return;
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = e.clientX - r.left;
      pointer.ty = e.clientY - r.top;
      if (pointer.x < -1000) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
    },
    { passive: true },
  );

  // ~30 fps is plenty for a slow field and keeps laptops cool.
  let last = 0;
  const start = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    pointer.x += (pointer.tx - pointer.x) * 0.18;
    pointer.y += (pointer.ty - pointer.y) * 0.18;
    draw((now - start) / 1000);
  };
  requestAnimationFrame(loop);
}
