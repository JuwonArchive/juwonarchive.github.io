/**
 * Halftone artwork: one twisted ribbon drawn as dots (bigger where the surface faces the viewer,
 * fading toward its edges and ends), plus faint dotted arcs in two corners. The ribbon twists
 * slowly and turns toward the pointer. Draws once (static) for reduced-motion visitors.
 */
type Opts = { color: string; pitch: number; reducedMotion: boolean; avoid?: () => Element | null };

const NU = 66; // dots along the ribbon
const NV = 17; // dots across it

export function mountHalftone(canvas: HTMLCanvasElement, opts: Opts) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.dataset.form = 'ribbon';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;

  // Clear zone behind the name so same-coloured letters stay legible.
  let clear: { l: number; t: number; r: number; b: number } | null = null;
  const FADE = 40;
  const measureClear = () => {
    const el = opts.avoid?.();
    if (!el) return (clear = null);
    const c = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    clear = { l: r.left - c.left - 10, t: r.top - c.top - 10, r: r.right - c.left + 10, b: r.bottom - c.top + 10 };
  };
  const clearFactor = (x: number, y: number) => {
    if (!clear) return 1;
    const d = Math.hypot(Math.max(clear.l - x, 0, x - clear.r), Math.max(clear.t - y, 0, y - clear.b));
    return d >= FADE ? 1 : d / FADE;
  };

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    measureClear();
  };

  const pose = { yaw: 0, pitch: 0, ty: 0, tp: 0 };

  const dot = (x: number, y: number, r: number) => {
    r *= clearFactor(x, y);
    if (r < 0.3) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  /** Faint concentric dotted arcs around a point just off the page. */
  const arcs = (cx: number, cy: number, from: number, to: number) => {
    ctx.globalAlpha = 0.55;
    for (let R = from; R < to; R += 22) {
      const fade = 1 - (R - from) / (to - from);
      const step = 15 / R;
      for (let a = 0; a < Math.PI * 2; a += step) {
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        dot(x, y, 0.6 + 1.6 * fade);
      }
    }
    ctx.globalAlpha = 1;
  };

  const ribbon = (t: number) => {
    const mobile = w < 768;
    const cx = mobile ? w * 0.5 : w * 0.56;
    const cy = mobile ? h * 0.58 : h * 0.62;
    const size = mobile ? w * 0.4 : Math.min(w, h) * 0.46;
    // Dot size follows the ribbon's size so small screens don't merge dots into a blob.
    const maxR = Math.min(opts.pitch * 0.62, size * 0.026);
    const yaw = pose.yaw + Math.sin(t * 0.15) * 0.25;
    const pitch = pose.pitch + 0.35;
    const roll = 0.32; // gentle diagonal: upper-left down to lower-right
    const [cyw, syw, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];

    const pts: { x: number; y: number; z: number; r: number }[] = [];
    for (let i = 0; i < NU; i++) {
      const u = i / (NU - 1);
      const s = u - 0.5;
      // Centre line arcs gently; the ribbon pinches in the middle like an hourglass.
      const C = [s * 2.3, 0.42 * Math.sin(s * Math.PI * 1.3), 0.3 * Math.cos(s * Math.PI)];
      const twist = s * Math.PI * 2.2 + t * 0.35;
      const width = 0.16 + 0.62 * Math.pow(Math.abs(s) * 2, 1.15);
      const [ct, st] = [Math.cos(twist), Math.sin(twist)];
      const ends = Math.pow(Math.sin(Math.PI * u), 0.55);
      for (let j = 0; j < NV; j++) {
        const v = (j / (NV - 1)) * 2 - 1;
        let x = C[0];
        let y = C[1] + v * width * ct;
        let z = C[2] + v * width * st;
        // Surface normal: perpendicular to the width direction, around the x axis.
        let nx = 0;
        let ny = -st;
        let nz = ct;
        // Rotate: yaw (y axis), pitch (x axis), roll (z axis).
        [x, z] = [x * cyw + z * syw, -x * syw + z * cyw];
        [nx, nz] = [nx * cyw + nz * syw, -nx * syw + nz * cyw];
        [y, z] = [y * cp - z * sp, y * sp + z * cp];
        [ny, nz] = [ny * cp - nz * sp, ny * sp + nz * cp];
        [x, y] = [x * cr - y * sr, x * sr + y * cr];
        const persp = 3.2 / (3.2 - z);
        const facing = 0.18 + 0.82 * Math.abs(nz);
        const edge = 1 - Math.pow(Math.abs(v), 3);
        pts.push({ x: cx + x * size * persp, y: cy + y * size * persp, z, r: maxR * facing * edge * ends * persp });
      }
    }
    // Keep every dot clear of its grid neighbours on screen, so pinched or edge-on parts of the
    // ribbon stay dotted instead of merging into a solid band.
    const at = (i: number, j: number) => pts[i * NV + j];
    const GAP = 0.42;
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const p = at(i, j);
        let nearest = Infinity;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = i + di >= 0 && i + di < NU && j + dj >= 0 && j + dj < NV ? at(i + di, j + dj) : null;
          if (q) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y));
        }
        p.r = Math.min(p.r, nearest * GAP);
      }
    let overlaps = 0;
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const p = at(i, j);
        if (i + 1 < NU) {
          const q = at(i + 1, j);
          if (p.r + q.r > Math.hypot(p.x - q.x, p.y - q.y) + 0.01) overlaps++;
        }
        if (j + 1 < NV) {
          const q = at(i, j + 1);
          if (p.r + q.r > Math.hypot(p.x - q.x, p.y - q.y) + 0.01) overlaps++;
        }
      }
    canvas.dataset.overlaps = String(overlaps);
    pts.sort((a, b) => a.z - b.z);
    for (const p of pts) dot(p.x, p.y, p.r);
  };

  const draw = (t: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.color;
    const m = Math.min(w, h);
    arcs(-m * 0.12, -m * 0.1, m * 0.22, m * 0.62);
    arcs(w + m * 0.1, h + m * 0.14, m * 0.18, m * 0.55);
    ribbon(t);
    canvas.dataset.pose = `${pose.yaw.toFixed(2)},${pose.pitch.toFixed(2)}`;
  };

  resize();
  new ResizeObserver(() => {
    resize();
    if (opts.reducedMotion) draw(0);
  }).observe(canvas);
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
      pose.ty = (e.clientX / window.innerWidth - 0.5) * 1.1;
      pose.tp = (e.clientY / window.innerHeight - 0.5) * 0.7;
    },
    { passive: true },
  );

  // ~30 fps is plenty for a slow twist and keeps laptops cool.
  let last = 0;
  const start = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    pose.yaw += (pose.ty - pose.yaw) * 0.08;
    pose.pitch += (pose.tp - pose.pitch) * 0.08;
    draw((now - start) / 1000);
  };
  requestAnimationFrame(loop);
}
