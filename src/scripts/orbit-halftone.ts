/**
 * Orbit halftone.
 * 1. A 3D orbital line drawing (sphere silhouette, tilted orbits, dashed meridians, centre ellipses)
 *    is splatted as soft Gaussians into a per-cell ink field (CPU only, no GPU readback).
 * 2. The field is drawn as a halftone screen: more ink → bigger dot, batched by size/alpha.
 *    The faint fine-dot grid behind it is a CSS background.
 * 3. A crisp, thin version of the same drawing sits on a second canvas with markers labelled by tools.
 * Rotates slowly and turns toward the pointer; draws once for reduced-motion visitors.
 */
type Opts = {
  dots: HTMLCanvasElement;
  lines: HTMLCanvasElement | null;
  dotColor: string;
  lineColor: string;
  labels: string[];
  /** Where each labelled marker leads (same order as labels): the matching archive box. */
  links?: string[];
  reducedMotion: boolean;
  /** full: halftone everywhere along the drawing · subtle: faint along orbits, revealed by the pointer · none: line art only */
  mode?: 'full' | 'subtle' | 'none';
  /** Phones: keep the sphere in the free band between these two elements (top bar and JUWON). */
  band?: { above: HTMLElement; below: HTMLElement } | null;
};

type V3 = [number, number, number];

const TAU = Math.PI * 2;
const LINE_ALPHA = 0.85; // orbit lines and labels read clearly (user)
const DESK_PITCH = 7; // halftone cell, CSS px (tighter spacing, user)
const PHONE_PITCH = 4; // phones: tighter again (user)
// Pointer reveal: a tight spot whose dots are biggest at the pointer and shrink with distance (user).
const REVEAL_SIGMA = 38; // smaller spot (user)
// A ripple ring leaves the pointer every RIPPLE_PERIOD seconds and fades as it spreads (user).
const RIPPLE_PERIOD = 1.6;
const RIPPLE_REACH = 120; // px the ring travels
const RIPPLE_WIDTH = 9; // ring thickness (Gaussian σ, px)
// The hover halftone fades away after the pointer rests this long, and returns on the next move (user).
const IDLE_MS = 3000; // 3s of rest before the hover halftone fades (user)
// Beyond this distance neither the spot (4σ) nor the ripple ring reaches.
const REACH = Math.max(4 * REVEAL_SIGMA, 10 + RIPPLE_REACH + 3 * RIPPLE_WIDTH);
// Halftone band along the orbits, as a Gaussian σ in px (narrower, user).
const BAND = 4.5;
const PHONE_BAND = 3;
// Crossing strokes (user: wide in the middle, pointed at both ends, only where lines cross).
const STROKE_HALF = 95; // px of orbit on each side of the crossing
const STROKE_HALF_PHONE = 42;
const STROKE_WIDTH = 7; // σ at the crossing, px
const STROKE_WIDTH_PHONE = 4;
const STROKE_INK = 1.15;
const MIN_CROSS_ANGLE = (28 * Math.PI) / 180;
// A new crossing grows its stroke over this long and sends out one ripple ring (user).
const STROKE_GROW_S = 0.6;
const CROSS_RIPPLE_S = 1.4;
// Thin, short rings (user: the first ones were too thick and spread too far).
const CROSS_RIPPLE_REACH = 60;
const CROSS_RIPPLE_REACH_PHONE = 32;
const CROSS_RIPPLE_WIDTH = 2.5; // ring σ, px
const CROSS_RIPPLE_WIDTH_PHONE = 2.4; // just over half the 4px grid, so the ring still draws dots
const RIPPLE_GAP_S = 1.6;
const MAX_CROSS_RIPPLES = 3;
const MUTED = '#7b8794';

/** Points of a circle of radius r in a plane tilted by (ax around x, az around z). */
function ring(r: number, ax: number, az: number, n = 160, phase = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU + phase;
    let x = Math.cos(a) * r;
    let y = 0;
    let z = Math.sin(a) * r;
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    out.push([x, y, z]);
  }
  return out;
}

type Pt = { x: number; y: number };

/** Where polyline `a` crosses polyline `b` at more than `minAngle`: segment index in `a` and position t∈[0,1). */
export function crossings(a: Pt[], b: Pt[], minAngle: number): { i: number; t: number }[] {
  const out: { i: number; t: number }[] = [];
  const sinMin = Math.sin(minAngle);
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1];
    const rx = a[i].x - p.x;
    const ry = a[i].y - p.y;
    const minX = Math.min(p.x, a[i].x), maxX = Math.max(p.x, a[i].x);
    const minY = Math.min(p.y, a[i].y), maxY = Math.max(p.y, a[i].y);
    for (let j = 1; j < b.length; j++) {
      const q = b[j - 1];
      const sx = b[j].x - q.x;
      const sy = b[j].y - q.y;
      if (Math.max(q.x, b[j].x) < minX || Math.min(q.x, b[j].x) > maxX || Math.max(q.y, b[j].y) < minY || Math.min(q.y, b[j].y) > maxY) continue;
      const den = rx * sy - ry * sx;
      if (!den) continue;
      const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
      const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      // |sin| of the angle between the two segments.
      if (Math.abs(den) / (Math.hypot(rx, ry) * Math.hypot(sx, sy)) < sinMin) continue;
      out.push({ i, t });
    }
  }
  return out;
}

/** Points along `pts` within `half` px of arc length either side of a crossing, with taper w = 1 − (s/half)². */
export function strokeSamples(pts: Pt[], i: number, t: number, half: number, step: number): { x: number; y: number; w: number }[] {
  const at = (k: number, f: number) => ({ x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f });
  const out: { x: number; y: number; w: number }[] = [];
  const centre = at(i, t);
  out.push({ ...centre, w: 1 });
  for (const dir of [1, -1]) {
    let s = 0;
    let next = step;
    let k = i;
    let cur = centre;
    while (s < half) {
      // Walk to the end of the current segment in this direction (orbits are closed loops).
      const target = dir > 0 ? { x: pts[k].x, y: pts[k].y } : { x: pts[k - 1].x, y: pts[k - 1].y };
      const seg = Math.hypot(target.x - cur.x, target.y - cur.y);
      while (next <= s + seg && next < half) {
        const r = seg ? (next - s) / seg : 0;
        const x = cur.x + (target.x - cur.x) * r;
        const y = cur.y + (target.y - cur.y) * r;
        const q = next / half;
        out.push({ x, y, w: 1 - q * q });
        next += step;
      }
      s += seg;
      cur = target;
      if (dir > 0) k = k + 1 >= pts.length ? 1 : k + 1;
      else k = k - 1 < 1 ? pts.length - 1 : k - 1;
      if (s > 10_000) break;
    }
  }
  return out;
}

export type TrackedCrossing = { key: string; x: number; y: number; born: number; seen: number; ring?: boolean };

/**
 * Follows crossings from frame to frame. Per pair of lines, crossings are matched to the nearest remembered ones
 * (however far they moved: the sphere can turn fast) and keep their birth time; only when a pair has more
 * crossings than before are the extra ones new (born now). Crossings that vanish are remembered for `keep`
 * seconds, so one that flickers at a segment joint or the angle limit is not reborn. New crossings grow their
 * stroke and ripple (user).
 */
export function trackCrossings(
  memory: TrackedCrossing[],
  now: { key: string; x: number; y: number }[],
  time: number,
  keep = 0.4,
): { now: TrackedCrossing[]; memory: TrackedCrossing[] } {
  const cur: TrackedCrossing[] = now.map((c) => ({ ...c, born: time, seen: time }));
  const used = new Set<number>();
  for (const key of new Set(now.map((c) => c.key))) {
    const pairs: [number, number, number][] = [];
    cur.forEach((c, i) => {
      if (c.key !== key) return;
      memory.forEach((m, j) => {
        if (m.key === key) pairs.push([Math.hypot(m.x - c.x, m.y - c.y), i, j]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const usedNow = new Set<number>();
    for (const [, i, j] of pairs) {
      if (usedNow.has(i) || used.has(j)) continue;
      usedNow.add(i);
      used.add(j);
      cur[i].born = memory[j].born;
      cur[i].ring = memory[j].ring;
    }
  }
  const ghosts = memory.filter((m, j) => !used.has(j) && time - m.seen < keep);
  return { now: cur, memory: [...cur, ...ghosts] };
}

export function mountOrbitHalftone(opts: Opts) {
  const { dots, lines } = opts;
  const dctx = dots.getContext('2d');
  const lctx = lines?.getContext('2d') ?? null;
  if (!dctx) return;
  dots.dataset.form = 'orbit';
  let field = new Float32Array(0); // halftone ink per cell
  let memory: TrackedCrossing[] = []; // crossings seen recently, with birth times
  const lastRipple = new Map<string, number>(); // per pair of lines
  const kx = new Float32Array(256);
  // Soft edges for free: the dot canvas renders at 0.75× and the browser's upscale blurs it ~0.5px.
  const BLUR = 0.5;
  const DOT_SCALE = 0.75;
  dots.dataset.blur = String(BLUR);
  // Halftone dots are soft by nature; 1.5× is plenty and cheaper on retina screens.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0;
  let h = 0;
  const pose = { yaw: 0, pitch: 0, ty: 0, tp: 0 };
  const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: 0, ton: 0 };
  let lastMove = 0; // last pointer move (ms), for the idle fade-out
  dots.dataset.dotColor = opts.dotColor;

  // Phone band (canvas coordinates) the sphere must fit in; null = whole canvas.
  let band: { top: number; bottom: number } | null = null;
  const resize = () => {
    w = dots.clientWidth;
    h = dots.clientHeight;
    band = null;
    if (opts.band && w < 768) {
      const c = dots.getBoundingClientRect();
      const top = opts.band.above.getBoundingClientRect().bottom - c.top + 16;
      const bottom = opts.band.below.getBoundingClientRect().top - c.top - 20;
      if (bottom - top > 120) band = { top, bottom };
    }
    dots.width = Math.round(w * DOT_SCALE);
    dots.height = Math.round(h * DOT_SCALE);
    if (lines) {
      lines.width = Math.round(w * dpr);
      lines.height = Math.round(h * dpr);
    }
  };

  const geometry = (t: number) => {
    const mobile = w < 768;
    // Phones (A): the sphere fills the band above JUWON. Desktop (B): centred, a little smaller.
    // 1.12 leaves room for perspective swell and the outer orbits.
    const R = band
      ? Math.min((band.bottom - band.top) / 2 / 1.12, w * 0.3) // 25% bigger than the first mock (user)
      : mobile
        ? w * 0.44
        : Math.min(w * 0.17, h * 0.28);
    const cx = w * 0.5;
    const cy = band ? (band.top + band.bottom) / 2 : h * 0.5;
    const yaw = pose.yaw + t * 0.08;
    const pitch = 0.32 + pose.pitch;
    const [cy_, sy_, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    const project = ([x, y, z]: V3) => {
      [x, z] = [x * cy_ + z * sy_, -x * sy_ + z * cy_];
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      const k = 4 / (4 - z);
      return { x: cx + x * R * k, y: cy + y * R * k, z };
    };
    const orbits = [
      ring(1, 1.15, 0.35),
      ring(1, 0.55, -0.9),
      ring(1, 1.45, 1.25),
    ].map((o) => o.map(project));
    const dashed = [ring(1, Math.PI / 2, 0), ring(1, Math.PI / 2, Math.PI / 2)].map((o) => o.map(project));
    const centre = [ring(0.62, 0.05, 0), ring(0.3, 0.05, 0)].map((o) => o.map(project));
    // Wireframe: parallels and meridians.
    const wire: { x: number; y: number; z: number }[][] = [];
    for (const lat of [-0.66, -0.33, 0.33, 0.66]) {
      const r = Math.cos(lat * (Math.PI / 2));
      const yv = Math.sin(lat * (Math.PI / 2));
      wire.push(ring(r, 0, 0, 120).map(([x, , z]) => project([x, yv, z])));
    }
    for (let m = 0; m < 6; m++) wire.push(ring(1, Math.PI / 2, 0, 120).map(([x, y, z]) => {
      const a = (m / 6) * Math.PI;
      return project([x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)]);
    }));
    return { R, cx, cy, orbits, dashed, centre, wire, project };
  };

  const stroke = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], k = 1) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
    ctx.stroke();
  };

  // Clickable areas (marker + label) for the current frame, page coordinates relative to the canvas.
  const hits: { x0: number; x1: number; y0: number; y1: number; href: string }[] = [];
  const hitAt = (clientX: number, clientY: number) => {
    const r = dots.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    return hits.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
  };
  const interactive = (el: EventTarget | null) => el instanceof Element && el.closest('a, button, input, [data-home-nav]');
  window.addEventListener('click', (e) => {
    if (e.button !== 0 || interactive(e.target)) return;
    const hit = hitAt(e.clientX, e.clientY);
    if (hit) window.location.href = hit.href;
  });
  window.addEventListener(
    'pointermove',
    (e) => {
      const over = !interactive(e.target) && !!hitAt(e.clientX, e.clientY);
      document.documentElement.style.cursor = over ? 'pointer' : '';
    },
    { passive: true },
  );

  // Where marker i sits on its orbit at time t (shared by the halftone and the line layer).
  const markerPhase = (i: number, t: number) => ((i * 0.27 + t * 0.025 * (1 + (i % 3) * 0.3)) % 1 + 1) % 1;
  const markerAt = (g: { orbits: { x: number; y: number }[][] }, i: number, t: number) => {
    const orbit = g.orbits[i % g.orbits.length];
    return orbit[Math.floor(markerPhase(i, t) * (orbit.length - 1))];
  };

  const draw = (t: number) => {
    const g = geometry(t);

    // 1. Ink field on the halftone grid, computed on the CPU (no GPU readback):
    //    every line is sampled and splatted as a soft Gaussian into the cells around it.
    // Phones show a much smaller sphere, so the screen is finer too (user).
    const PITCH = w < 768 ? PHONE_PITCH : DESK_PITCH;
    const cols = Math.ceil(w / PITCH);
    const rows = Math.ceil(h / PITCH);
    if (field.length !== cols * rows) field = new Float32Array(cols * rows);
    else field.fill(0);
    const splat = (x: number, y: number, amount: number, radius: number) => {
      const cxi = x / PITCH - 0.5;
      const cyi = y / PITCH - 0.5;
      const rc = Math.ceil((2.6 * radius) / PITCH); // cover ~2.6σ so the falloff stays round
      const inv = 1 / (2 * (radius / PITCH) ** 2);
      const x0 = Math.max(0, Math.floor(cxi - rc));
      const x1 = Math.min(cols - 1, Math.ceil(cxi + rc));
      const y0 = Math.max(0, Math.floor(cyi - rc));
      const y1 = Math.min(rows - 1, Math.ceil(cyi + rc));
      // Separable Gaussian: one exp per column and per row instead of per cell.
      const gx = kx.subarray(0, x1 - x0 + 1);
      for (let xx = x0; xx <= x1; xx++) gx[xx - x0] = Math.exp(-((xx - cxi) ** 2) * inv);
      for (let yy = y0; yy <= y1; yy++) {
        const gy = amount * Math.exp(-((yy - cyi) ** 2) * inv);
        const row = yy * cols;
        for (let xx = x0; xx <= x1; xx++) field[row + xx] += gy * gx[xx - x0];
      }
    };
    const mode = opts.mode ?? 'subtle';
    dots.dataset.mode = mode;
    const subtle = mode === 'subtle';
    // Brush strokes (user): where an orbit crosses another orbit or a centre ellipse, a halftone stroke runs
    // along the orbit, widest at the crossing and tapering to a point at both ends. Shallow crossings (lines
    // running side by side) get none, so the sphere's edge stays clean.
    const phone = w < 768;
    const half = phone ? STROKE_HALF_PHONE : STROKE_HALF;
    const widest = phone ? STROKE_WIDTH_PHONE : STROKE_WIDTH;
    const step = PITCH * 0.7;
    const others = [...g.orbits, ...g.centre];
    const found: { key: string; x: number; y: number; orbit: Pt[]; i: number; t: number }[] = [];
    g.orbits.forEach((orbit, oi) => {
      for (let oj = 0; oj < others.length; oj++) {
        if (oj <= oi) continue; // each orbit pair once; every orbit against both ellipses
        for (const c of crossings(orbit, others[oj], MIN_CROSS_ANGLE)) {
          const a = orbit[c.i - 1];
          const b = orbit[c.i];
          found.push({ key: `${oi}-${oj}`, x: a.x + (b.x - a.x) * c.t, y: a.y + (b.y - a.y) * c.t, orbit, i: c.i, t: c.t });
        }
      }
    });
    // New crossings (user): the stroke grows out from the crossing and a ripple spreads from it.
    const track = trackCrossings(memory, found, t);
    memory = track.memory;
    // Calm when the sphere swings fast: a pair of lines ripples at most once per RIPPLE_GAP_S, and at most
    // MAX_CROSS_RIPPLES rings run at once.
    let ripples = 0;
    found.forEach((c, n) => {
      const age = opts.reducedMotion ? Infinity : t - track.now[n].born;
      if (age === 0) {
        // Every new crossing grows its stroke; only some send a ring.
        const last = lastRipple.get(c.key) ?? -Infinity;
        if (t - last >= RIPPLE_GAP_S) {
          lastRipple.set(c.key, t);
          track.now[n].ring = true;
        }
      }
      const g01 = Math.min(1, age / STROKE_GROW_S);
      const grow = 1 - (1 - g01) ** 3; // ease out
      if (grow > 0.02) {
        for (const p of strokeSamples(c.orbit, c.i, c.t, half * grow, step)) {
          const radius = widest * (0.18 + 0.82 * p.w) * (0.5 + 0.5 * grow);
          // Peak ink ≈ p.w for a line of splats `step` apart with σ = radius.
          splat(p.x, p.y, ((p.w * step) / (radius * Math.sqrt(2 * Math.PI))) * STROKE_INK * grow, radius);
        }
      }
      if (age < CROSS_RIPPLE_S && track.now[n].ring && ripples < MAX_CROSS_RIPPLES) {
        ripples++;
        const k = age / CROSS_RIPPLE_S;
        const r = 6 + k * (phone ? CROSS_RIPPLE_REACH_PHONE : CROSS_RIPPLE_REACH);
        const sigma = phone ? CROSS_RIPPLE_WIDTH_PHONE : CROSS_RIPPLE_WIDTH;
        const amp = 0.85 * (1 - k) ** 1.4;
        const count = Math.max(12, Math.ceil((2 * Math.PI * r) / step));
        const amount = ((amp * ((2 * Math.PI * r) / count)) / (sigma * Math.sqrt(2 * Math.PI)));
        for (let j = 0; j < count; j++) {
          const th = (j / count) * TAU;
          splat(c.x + Math.cos(th) * r, c.y + Math.sin(th) * r, amount, sigma);
        }
      }
    });
    dots.dataset.strokes = String(found.length);
    dots.dataset.crossRipples = String(ripples);
    // Pointer: a soft swell under the cursor ('full' mode only).
    if (ptr.on > 0.01 && mode === 'full') splat(ptr.x, ptr.y, 0.85 * ptr.on, 45);

    // 2. Halftone screen, batched: dots of similar size/alpha share one path.
    dctx.setTransform(DOT_SCALE, 0, 0, DOT_SCALE, 0, 0);
    dctx.clearRect(0, 0, w, h);
    dctx.fillStyle = opts.dotColor;
    // Smallest dot 1px (no micro-dots), largest 3.4px.
    const MIN_R = w < 768 ? 0.6 : 1;
    // Diameter stays below the 7px spacing so dots never touch; smaller on phones.
    // Diameter stays below the spacing so dots never touch.
    const max = w < 768 ? 1.3 : 3.0;
    const buckets = new Map<number, number[]>();
    // Ripple: one ring per period, born at the pointer, fading as it spreads.
    const phase = (t / RIPPLE_PERIOD) % 1;
    const ringR = 10 + phase * RIPPLE_REACH;
    const ringAmp = 0.95 * (1 - phase) ** 1.2 * Math.min(1, phase * 8);
    for (let yy = 0; yy < rows; yy++)
      for (let xx = 0; xx < cols; xx++) {
        const k = yy * cols + xx;
        let a = Math.min(1, field[k]);
        if (mode === 'none') continue;
        if (subtle) {
          const base = a * 0.75;
          a = base;
          // Only cells the spot or the ripple can reach need the pointer maths (saves ~90% of a frame's work).
          const px = xx * PITCH + PITCH / 2 - ptr.x;
          const py = yy * PITCH + PITCH / 2 - ptr.y;
          if (ptr.on > 0.01 && px < REACH && px > -REACH && py < REACH && py > -REACH) {
            // Faint along the orbits; the pointer reveals the halftone around it.
            const d2 = px * px + py * py;
            const reveal = Math.exp(-d2 / (2 * REVEAL_SIGMA * REVEAL_SIGMA));
            const dr = Math.sqrt(d2) - ringR;
            const ring = ringAmp * Math.exp(-(dr * dr) / (2 * RIPPLE_WIDTH * RIPPLE_WIDTH));
            // Size follows distance: full dots at the pointer, shrinking outward, plus the travelling
            // ripple. Screen-blended with the orbit dots so the spot and the orbits meet without a crease.
            // The spot stays a little lighter than the ring so each ripple reads as it passes through.
            a = Math.min(1, base + ptr.on * Math.min(1, reveal * 0.7 + ring) * (1 - base));
          }
        }
        if (a < 0.06) continue;
        const rq = Math.round((MIN_R + (max - MIN_R) * Math.pow(Math.max(0, a - 0.12) / 0.88, 0.85)) * 4); // quarter-px steps
        // Outermost dots fade in instead of popping on at a hard threshold (no visible ring).
        const fade = Math.min(1, (a - 0.06) / 0.2);
        // Fade (user): further from a stroke's middle the dots get lighter as well as smaller.
        const aq = Math.round((0.12 + 0.88 * Math.pow(a, 1.1)) * fade * fade * (3 - 2 * fade) * 12); // 12 alpha steps
        if (!aq) continue;
        const key = rq * 16 + aq;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(xx * PITCH + PITCH / 2, yy * PITCH + PITCH / 2);
      }
    const sizes = new Set<number>();
    for (const [key, list] of buckets) {
      sizes.add(key >> 4);
      dctx.globalAlpha = (key & 15) / 12;
      const r = (key >> 4) / 4;
      const path = new Path2D();
      for (let i = 0; i < list.length; i += 2) {
        path.moveTo(list[i] + r, list[i + 1]);
        path.arc(list[i], list[i + 1], r, 0, TAU);
      }
      dctx.fill(path);
    }
    dctx.globalAlpha = 1;
    dots.dataset.sizeSteps = String(sizes.size);
    dots.dataset.maxR = String(max);
    dots.dataset.minR = String(MIN_R);
    dots.dataset.pitch = String(PITCH);
    dots.dataset.ink = 'strokes';
    dots.dataset.ripple = String(RIPPLE_PERIOD);
    dots.dataset.idle = String(IDLE_MS);
    dots.dataset.hover = ptr.on.toFixed(2);
    dots.dataset.band = String(w < 768 ? PHONE_BAND : BAND);
    dots.dataset.overlapBand = String(band);
    dots.dataset.reveal = String(REVEAL_SIGMA);
    dots.dataset.readback = 'none';
    dots.dataset.cx = String(Math.round(g.cx));

    // 3. Crisp thin line art, markers and labels.
    if (lctx && lines) {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);
      lctx.strokeStyle = lctx.fillStyle = opts.lineColor;
      lctx.lineWidth = 0.8;
      lctx.globalAlpha = LINE_ALPHA;
      lctx.beginPath();
      lctx.arc(g.cx, g.cy, g.R, 0, TAU);
      lctx.stroke();
      for (const o of g.orbits) stroke(lctx, o);
      for (const o of g.centre) stroke(lctx, o);
      lctx.setLineDash([2, 4]);
      for (const o of g.dashed) stroke(lctx, o);
      lctx.setLineDash([]);
      // Thin latitude/longitude wireframe gives the sphere its form.
      lctx.globalAlpha = 0.3;
      lctx.lineWidth = 0.6;
      for (const o of g.wire) stroke(lctx, o);
      lines.dataset.wire = 'latlong';
      // Dotted straight guides through the centre: axes and diagonals.
      lctx.globalAlpha = 0.7;
      lctx.setLineDash([1, 4]);
      let dotted = 0;
      for (const ang of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const L = ang % (Math.PI / 2) === 0 ? g.R : g.R * 0.98;
        lctx.beginPath();
        lctx.moveTo(g.cx - Math.cos(ang) * L, g.cy - Math.sin(ang) * L);
        lctx.lineTo(g.cx + Math.cos(ang) * L, g.cy + Math.sin(ang) * L);
        lctx.stroke();
        dotted++;
      }
      lctx.setLineDash([]);
      lines.dataset.dotted = String(dotted);
      lctx.lineWidth = 0.8;
      lctx.globalAlpha = LINE_ALPHA;
      // Ticks at the four cardinal points.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        lctx.beginPath();
        lctx.moveTo(g.cx + dx * (g.R + 6), g.cy + dy * (g.R + 6));
        lctx.lineTo(g.cx + dx * (g.R + 18), g.cy + dy * (g.R + 18));
        lctx.stroke();
      }
      // Crosshair and nucleus.
      lctx.beginPath();
      lctx.moveTo(g.cx - 14, g.cy);
      lctx.lineTo(g.cx + 14, g.cy);
      lctx.moveTo(g.cx, g.cy - 14);
      lctx.lineTo(g.cx, g.cy + 14);
      lctx.stroke();
      lctx.beginPath();
      lctx.arc(g.cx, g.cy, 7, 0, TAU);
      lctx.stroke();
      // Markers travel along the orbits: one per archive box, numbered like the boxes.
      lctx.globalAlpha = 1;
      lctx.fillStyle = opts.lineColor;
      hits.length = 0;
      lctx.font = '10px "Geist Mono Variable", ui-monospace, monospace';
      const shown: string[] = [];
      opts.labels.forEach((label, i) => {
        const orbit = g.orbits[i % g.orbits.length];
        const n = orbit.length - 1;
        const f = markerPhase(i, t);
        const p = orbit[Math.floor(f * n)];
        const q = orbit[(Math.floor(f * n) + 2) % n];
        lctx.beginPath();
        lctx.arc(p.x, p.y, 3, 0, TAU);
        lctx.fill();
        // Small arrowhead pointing along the orbit.
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        lctx.beginPath();
        lctx.moveTo(p.x + Math.cos(ang) * 12, p.y + Math.sin(ang) * 12);
        lctx.lineTo(p.x + Math.cos(ang + 2.6) * 6 + Math.cos(ang) * 12, p.y + Math.sin(ang + 2.6) * 6 + Math.sin(ang) * 12);
        lctx.lineTo(p.x + Math.cos(ang - 2.6) * 6 + Math.cos(ang) * 12, p.y + Math.sin(ang - 2.6) * 6 + Math.sin(ang) * 12);
        lctx.closePath();
        lctx.fill();
        // "01  3D DESIGN": muted number, ink title — the same caption as the box.
        const [num, ...rest] = label.toUpperCase().split(' ');
        const title = rest.join(' ');
        const numText = title ? `${num}  ` : '';
        const nw = lctx.measureText(numText).width;
        const tw = nw + lctx.measureText(title || num).width;
        // Keep labels on screen: flip to the side with room.
        const right = p.x >= g.cx ? p.x + 10 + tw < w - 8 : p.x - 10 - tw < 8;
        const x0 = right ? p.x + 10 : p.x - 10 - tw;
        lctx.textAlign = 'left';
        // Thin white halo so orbit lines never cut through the caption.
        lctx.strokeStyle = '#ffffff';
        lctx.lineWidth = 3;
        lctx.lineJoin = 'round';
        lctx.strokeText(numText + (title || num), x0, p.y - 8);
        lctx.fillStyle = MUTED;
        lctx.fillText(numText, x0, p.y - 8);
        lctx.fillStyle = opts.lineColor;
        lctx.fillText(title || num, x0 + nw, p.y - 8);
        const href = opts.links?.[i];
        if (href) hits.push({ x0: Math.min(p.x - 8, x0 - 4), x1: Math.max(p.x + 8, x0 + tw + 4), y0: p.y - 22, y1: p.y + 8, href });
        shown.push(label);
      });
      lctx.globalAlpha = 1;
      lines.dataset.labels = JSON.stringify(shown);
      // Marker centres in viewport coordinates, for tests.
      const cr = dots.getBoundingClientRect();
      lines.dataset.hits = JSON.stringify(hits.map((b) => ({ x: Math.round(cr.left + (b.x0 + b.x1) / 2), y: Math.round(cr.top + b.y1 - 8) })));
      lines.dataset.lineAlpha = String(LINE_ALPHA);
    }
    dots.dataset.cy = String(Math.round(g.cy));
    dots.dataset.r = String(Math.round(g.R));
    dots.dataset.pose = `${pose.yaw.toFixed(2)},${pose.pitch.toFixed(2)}`;
  };

  resize();
  const ro = new ResizeObserver(() => {
    resize();
    if (opts.reducedMotion) draw(0);
  });
  ro.observe(dots);
  // JUWON's height changes when the display font loads.
  if (opts.band) ro.observe(opts.band.below);

  if (opts.reducedMotion) {
    dots.toggleAttribute('data-static', true);
    draw(0);
    return;
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      pose.ty = (e.clientX / window.innerWidth - 0.5) * 1.0;
      pose.tp = (e.clientY / window.innerHeight - 0.5) * 0.5;
      const r = dots.getBoundingClientRect();
      ptr.tx = e.clientX - r.left;
      ptr.ty = e.clientY - r.top;
      ptr.ton = 1;
      lastMove = performance.now();
      if (ptr.x < -1000) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
    },
    { passive: true },
  );

  // Pause when the tab is hidden or the artwork is scrolled away.
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(dots);
  let last = 0;
  const start = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    // ~30 fps on desktop, ~24 fps on phones: the motion is slow, and phones have less to spare.
    if (!visible || document.hidden || now - last < (w < 768 ? 41 : 33)) return;
    last = now;
    pose.yaw += (pose.ty - pose.yaw) * 0.08;
    pose.pitch += (pose.tp - pose.pitch) * 0.08;
    ptr.x += (ptr.tx - ptr.x) * 0.2;
    ptr.y += (ptr.ty - ptr.y) * 0.2;
    // Resting pointer: let the hover halftone fade away (about a second) until it moves again.
    if (ptr.ton && now - lastMove > IDLE_MS) ptr.ton = 0;
    ptr.on += (ptr.ton - ptr.on) * (ptr.ton ? 0.1 : 0.06);
    draw(Math.max(0, (now - start) / 1000));
  };
  requestAnimationFrame(loop);
}
