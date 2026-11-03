/**
 * Halftone artwork. A fixed set of dots morphs between forms:
 *   fold — a sheet folded by crossing waves
 *   vortex — a spiral funnel
 *   torus — a breathing, twisting torus
 *   bloom — radial petals rising and falling
 * Dots are bigger where the surface faces the viewer.
 * Shared 3D rotation follows the pointer. Dots are capped so they never touch each other.
 * Reduced motion: the first form, drawn once.
 */
type Opts = { color: string; pitch: number; reducedMotion: boolean; avoid?: () => Element | null; trace?: HTMLCanvasElement | null; traceColor?: string };
type P = { x: number; y: number; z: number; nx: number; ny: number; nz: number; w: number };

const N = 1600;
const FORMS = ['fold', 'vortex', 'torus', 'bloom'] as const;
type Form = (typeof FORMS)[number];
const HOLD = 6; // seconds a form stays
const MORPH = 2.5; // seconds to flow into the next

const blank = (): P => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, w: 0 });

/** Order points along a diagonal so morphs sweep across instead of scrambling. */
const ordered = (pts: P[]) => {
  while (pts.length < N) pts.push(blank());
  pts.length = N;
  return pts.sort((a, b) => a.x + a.y * 0.6 - (b.x + b.y * 0.6));
};

/** Push a parametric surface sampled on a NU×NV grid; normal from finite differences. */
function surface(NU: number, NV: number, f: (u: number, v: number) => [number, number, number], weight: (u: number, v: number) => number): P[] {
  const pts: P[] = [];
  const e = 1e-3;
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const u = i / (NU - 1);
      const v = j / (NV - 1);
      const p = f(u, v);
      const pu = f(u + e, v);
      const pv = f(u, v + e);
      const a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]];
      const b = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
      let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = n.map((c) => c / l);
      pts.push({ x: p[0], y: p[1], z: p[2], nx: n[0], ny: n[1], nz: n[2], w: weight(u, v) });
    }
  return ordered(pts);
}

const soft = (x: number) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), 0.6);

/** A sheet folded by crossing waves, drifting like cloth. */
const fold = (t: number) =>
  surface(
    50,
    32,
    (u, v) => {
      const x = (u - 0.5) * 2.2;
      const y = (v - 0.5) * 1.25;
      return [x, y, 0.32 * Math.sin(x * 2.1 + t * 0.6) + 0.22 * Math.cos(y * 3.2 - x * 1.1 + t * 0.45)];
    },
    (u, v) => soft(u) * soft(v),
  );

/** A spiral funnel turning slowly. */
const vortex = (t: number) =>
  surface(
    64,
    25,
    (u, v) => {
      const r = 0.12 + v * 1.1;
      const a = u * Math.PI * 2 + v * 2.4 + t * 0.35;
      return [Math.cos(a) * r, Math.sin(a) * r * 0.9, 0.9 * Math.pow(1 - v, 2) - 0.35];
    },
    (_, v) => soft(v * 0.92 + 0.04) * (0.4 + 0.6 * v),
  );

/** A torus whose tube breathes and twists. */
const torus = (t: number) =>
  surface(
    64,
    25,
    (u, v) => {
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2 + a * 1.5 + t * 0.4;
      const R = 0.85;
      const r = 0.34 + 0.08 * Math.sin(a * 3 + t * 0.8);
      return [(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a) * 0.95, r * Math.sin(b)];
    },
    () => 0.85,
  );

/** A radial bloom: petals rising and falling around a centre. */
const bloom = (t: number) =>
  surface(
    64,
    25,
    (u, v) => {
      const a = u * Math.PI * 2;
      const petals = 0.75 + 0.25 * Math.cos(a * 5 + t * 0.5);
      const r = v * 1.15 * petals;
      return [Math.cos(a) * r, Math.sin(a) * r, 0.45 * Math.sin(v * Math.PI) * Math.cos(a * 5 + t * 0.5) - 0.1];
    },
    (_, v) => soft(v * 0.95 + 0.05) * (0.6 + 0.4 * v),
  );

const BUILD: Record<Form, (t: number) => P[]> = { fold, vortex, torus, bloom };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function mountHalftone(canvas: HTMLCanvasElement, opts: Opts) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.dataset.forms = FORMS.join(',');
  canvas.dataset.form = FORMS[0];
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

  const tctx = opts.trace?.getContext('2d') ?? null;

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (opts.trace) {
      opts.trace.width = canvas.width;
      opts.trace.height = canvas.height;
    }
    measureClear();
  };

  /**
   * Plotter overlay: a dozen dots picked along the artwork, marked ○ □ △ with their screen
   * coordinates, joined by straight segments and threaded by one smooth curve.
   */
  const MARKS = 12;
  const plot = () => {
    if (!tctx || !opts.trace) return;
    const picks: { x: number; y: number }[] = [];
    const step = Math.floor(N / (MARKS + 1));
    for (let k = 1; k <= MARKS; k++) {
      // Nearest visible dot to the evenly spaced slot.
      for (let d = 0; d < step; d++) {
        const i = k * step + (d % 2 ? -1 : 1) * Math.ceil(d / 2);
        if (i >= 0 && i < N && sr[i] > 0.8 && clearFactor(sx[i], sy[i]) >= 1) {
          picks.push({ x: sx[i], y: sy[i] });
          break;
        }
      }
    }
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, w, h);
    tctx.strokeStyle = tctx.fillStyle = opts.traceColor ?? '#111';
    tctx.lineWidth = 1;
    tctx.font = '10px "Geist Mono Variable", ui-monospace, monospace';
    if (picks.length < 2) return void (opts.trace.dataset.labels = '[]');
    // Straight segments.
    tctx.globalAlpha = 0.55;
    tctx.beginPath();
    picks.forEach((p, i) => (i ? tctx.lineTo(p.x, p.y) : tctx.moveTo(p.x, p.y)));
    tctx.stroke();
    // Smooth curve through the same points (Catmull-Rom as Béziers).
    tctx.globalAlpha = 0.9;
    tctx.beginPath();
    tctx.moveTo(picks[0].x, picks[0].y);
    for (let i = 0; i < picks.length - 1; i++) {
      const p0 = picks[Math.max(0, i - 1)];
      const p1 = picks[i];
      const p2 = picks[i + 1];
      const p3 = picks[Math.min(picks.length - 1, i + 2)];
      tctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    tctx.stroke();
    // Markers and coordinate labels.
    tctx.globalAlpha = 1;
    const labels: string[] = [];
    picks.forEach((p, i) => {
      const s = 5;
      tctx.fillStyle = '#fff';
      tctx.beginPath();
      if (i % 3 === 0) tctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      else if (i % 3 === 1) tctx.rect(p.x - s, p.y - s, s * 2, s * 2);
      else {
        tctx.moveTo(p.x, p.y - s - 1);
        tctx.lineTo(p.x + s + 1, p.y + s);
        tctx.lineTo(p.x - s - 1, p.y + s);
        tctx.closePath();
      }
      tctx.fill();
      tctx.stroke();
      const label = `${Math.round(p.x)} ${Math.round(h - p.y)}`;
      labels.push(label);
      tctx.fillStyle = opts.traceColor ?? '#111';
      tctx.fillText(label, p.x - 16, p.y - 10);
    });
    opts.trace.dataset.labels = JSON.stringify(labels);
  };

  const pose = { yaw: 0, pitch: 0, ty: 0, tp: 0 };
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const sz = new Float32Array(N);
  const sr = new Float32Array(N);
  const nearest = new Float32Array(N);

  /** Cap each dot at a share of the distance to its nearest neighbour (spatial hash). */
  const separate = (cell: number) => {
    const grid = new Map<number, number[]>();
    const key = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;
    for (let i = 0; i < N; i++) {
      if (sr[i] <= 0) continue;
      const k = key(Math.floor(sx[i] / cell), Math.floor(sy[i] / cell));
      let b = grid.get(k);
      if (!b) grid.set(k, (b = []));
      b.push(i);
    }
    nearest.fill(Infinity);
    for (let i = 0; i < N; i++) {
      if (sr[i] <= 0) continue;
      const cx = Math.floor(sx[i] / cell);
      const cy = Math.floor(sy[i] / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const b = grid.get(key(cx + dx, cy + dy));
          if (!b) continue;
          for (const j of b) {
            if (j === i) continue;
            const d = Math.hypot(sx[i] - sx[j], sy[i] - sy[j]);
            if (d < nearest[i]) nearest[i] = d;
          }
        }
    }
    let overlaps = 0;
    for (let i = 0; i < N; i++) {
      if (sr[i] <= 0 || nearest[i] === Infinity) continue;
      sr[i] = Math.min(sr[i], nearest[i] * 0.42);
      if (sr[i] * 2 > nearest[i] + 0.01) overlaps++;
    }
    canvas.dataset.overlaps = String(overlaps);
  };

  const draw = (t: number) => {
    const cycle = HOLD + MORPH;
    const k = Math.floor(t / cycle);
    const phase = t - k * cycle;
    const a = FORMS[k % FORMS.length];
    const b = FORMS[(k + 1) % FORMS.length];
    const m = phase < HOLD ? 0 : ease((phase - HOLD) / MORPH);
    canvas.dataset.form = m < 0.5 ? a : b;
    const A = BUILD[a](t);
    const B = m > 0 ? BUILD[b](t) : A;

    const mobile = w < 768;
    const cx = mobile ? w * 0.5 : w * 0.55;
    const cy = mobile ? h * 0.4 : h * 0.42;
    const size = mobile ? w * 0.44 : Math.min(w * 0.36, h * 0.5);
    const maxR = Math.min(opts.pitch * 0.66, size * 0.028);
    const yaw = pose.yaw + Math.sin(t * 0.15) * 0.25;
    const pitch = pose.pitch + 0.3;
    const roll = 0.2;
    const [cyw, syw, cp, sp, cr, srl] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];

    for (let i = 0; i < N; i++) {
      const p = A[i];
      const q = B[i];
      let x = p.x + (q.x - p.x) * m;
      let y = p.y + (q.y - p.y) * m;
      let z = p.z + (q.z - p.z) * m;
      let nx = p.nx + (q.nx - p.nx) * m;
      let ny = p.ny + (q.ny - p.ny) * m;
      let nz = p.nz + (q.nz - p.nz) * m;
      const wt = p.w + (q.w - p.w) * m;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      [x, z] = [x * cyw + z * syw, -x * syw + z * cyw];
      [nx, nz] = [nx * cyw + nz * syw, -nx * syw + nz * cyw];
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      [ny, nz] = [ny * cp - nz * sp, ny * sp + nz * cp];
      [x, y] = [x * cr - y * srl, x * srl + y * cr];
      const persp = 3.2 / (3.2 - z);
      sx[i] = cx + x * size * persp;
      sy[i] = cy + y * size * persp;
      sz[i] = z;
      sr[i] = wt > 0.02 ? maxR * (0.18 + 0.82 * Math.abs(nz)) * wt * persp : 0;
    }
    separate(Math.max(8, maxR * 3));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.color;
    const order = Array.from({ length: N }, (_, i) => i).sort((i, j) => sz[i] - sz[j]);
    for (const i of order) {
      const r = sr[i] * clearFactor(sx[i], sy[i]);
      if (r < 0.3) continue;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
    canvas.dataset.pose = `${pose.yaw.toFixed(2)},${pose.pitch.toFixed(2)}`;
    plot();
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

  // ~30 fps is plenty for slow motion and keeps laptops cool.
  let last = 0;
  const start = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    pose.yaw += (pose.ty - pose.yaw) * 0.08;
    pose.pitch += (pose.tp - pose.pitch) * 0.08;
    draw(Math.max(0, (now - start) / 1000)); // rAF time can precede start
  };
  requestAnimationFrame(loop);
}
