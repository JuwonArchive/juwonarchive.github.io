/**
 * Halftone artwork. A fixed set of dots morphs between forms:
 *   ribbon — a twisted band (bigger dots where it faces the viewer)
 *   cloud  — a halftone cloud with concentric ripples inside and dotted rings on both sides
 *   ripple — a tilted disc of concentric dotted rings
 * Shared 3D rotation follows the pointer. Dots are capped so they never touch each other.
 * Reduced motion: the ribbon, drawn once.
 */
type Opts = { color: string; pitch: number; reducedMotion: boolean; avoid?: () => Element | null };
type P = { x: number; y: number; z: number; nx: number; ny: number; nz: number; w: number };

const N = 1600;
const FORMS = ['ribbon', 'cloud', 'ripple'] as const;
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

function ribbon(t: number): P[] {
  const NU = 80;
  const NV = 20;
  const pts: P[] = [];
  for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1);
    const s = u - 0.5;
    const C = [s * 2.4, 0.42 * Math.sin(s * Math.PI * 1.3), 0.3 * Math.cos(s * Math.PI)];
    const twist = s * Math.PI * 2.2 + t * 0.35;
    const width = 0.18 + 0.66 * Math.pow(Math.abs(s) * 2, 1.15);
    const [ct, st] = [Math.cos(twist), Math.sin(twist)];
    const ends = Math.pow(Math.sin(Math.PI * u), 0.55);
    for (let j = 0; j < NV; j++) {
      const v = (j / (NV - 1)) * 2 - 1;
      pts.push({ x: C[0], y: C[1] + v * width * ct, z: C[2] + v * width * st, nx: 0, ny: -st, nz: ct, w: ends * (1 - Math.pow(Math.abs(v), 3)) });
    }
  }
  return ordered(pts);
}

function cloud(t: number): P[] {
  const pts: P[] = [];
  // Dotted rings on both sides.
  for (const [cx, cy, R] of [
    [-1.05, 0.05, 0.42],
    [1.0, 0.0, 0.38],
  ]) {
    for (let k = 1; k <= 5; k++) {
      const r = (R * k) / 5;
      const count = Math.round(14 + k * 9);
      for (let a = 0; a < count; a++) {
        const th = (a / count) * Math.PI * 2 + t * 0.15 * (k % 2 ? 1 : -1);
        pts.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r, z: 0, nx: 0, ny: 0, nz: 1, w: 0.35 + 0.25 * (1 - k / 6) });
      }
    }
  }
  // Halftone body: grid inside a lumpy blob, concentric ripples modulating dot size.
  const G = Math.ceil(Math.sqrt((N - pts.length) / 0.72));
  for (let gy = 0; gy < G && pts.length < N; gy++)
    for (let gx = 0; gx < G && pts.length < N; gx++) {
      const x = (gx / (G - 1)) * 2 - 1;
      const y = (gy / (G - 1)) * 2 - 1;
      const ang = Math.atan2(y, x);
      const edge = 0.82 + 0.16 * Math.sin(ang * 3 + 1) + 0.08 * Math.sin(ang * 5 + t * 0.2);
      const d = Math.hypot(x * 1.15, y);
      if (d > edge) continue;
      const wave = 0.5 + 0.5 * Math.cos(Math.hypot(x + 0.15, y) * 14 - t * 1.6);
      const fade = 1 - Math.pow(d / edge, 3);
      pts.push({ x: x * 1.0, y: y * 0.78, z: 0.12 * Math.sin(x * 3 + t * 0.4), nx: 0, ny: 0, nz: 1, w: fade * (0.4 + 0.6 * wave) });
    }
  return ordered(pts);
}

function ripple(t: number): P[] {
  const pts: P[] = [];
  const RINGS = 16;
  const tilt = 0.62;
  for (let k = 1; k <= RINGS && pts.length < N; k++) {
    const r = (k / RINGS) * 1.15;
    const count = Math.round(6 + k * 5.2);
    const wave = 0.5 + 0.5 * Math.cos(r * 11 - t * 1.8);
    for (let a = 0; a < count; a++) {
      const th = (a / count) * Math.PI * 2;
      const x = Math.cos(th) * r;
      const y0 = Math.sin(th) * r;
      const z0 = 0.1 * wave;
      // The disc lies in a tilted plane so it reads as seen from above.
      pts.push({
        x,
        y: y0 * Math.cos(tilt) - z0 * Math.sin(tilt),
        z: y0 * Math.sin(tilt) + z0 * Math.cos(tilt),
        nx: 0,
        ny: -Math.sin(tilt),
        nz: Math.cos(tilt),
        w: (1 - Math.pow(k / RINGS, 2.6)) * (0.45 + 0.55 * wave),
      });
    }
  }
  return ordered(pts);
}

const BUILD: Record<Form, (t: number) => P[]> = { ribbon, cloud, ripple };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function mountHalftone(canvas: HTMLCanvasElement, opts: Opts) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.dataset.forms = FORMS.join(',');
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
    const cy = mobile ? h * 0.58 : h * 0.6;
    const size = mobile ? w * 0.48 : Math.min(w * 0.42, h * 0.7);
    const maxR = Math.min(opts.pitch * 0.66, size * 0.028);
    const yaw = pose.yaw + Math.sin(t * 0.15) * 0.25;
    const pitch = pose.pitch + 0.3;
    const roll = 0.32;
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
