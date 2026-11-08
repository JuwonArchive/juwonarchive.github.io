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
  /** Darker dots for the crossing bursts. */
  burstColor?: string;
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
// Sphere tilt in radians (positive looks from below): resting, pointer at the top, pointer at the bottom.
/** Camera distance in sphere radii: closer = stronger perspective, so the front of each orbit swells (user). */
export const CAMERA = 2.6;
/** Apparent radius of the sphere's outline at that distance, as a multiple of R. */
export const SILHOUETTE = CAMERA / Math.sqrt(CAMERA * CAMERA - 1);
/** The sphere was fitted at camera 4; scale R so its outline keeps the same size on screen. */
const PERSPECTIVE_FIT = 4 / Math.sqrt(15) / SILHOUETTE;
/** Depth cue for a line at nearness n (0 = far side, 1 = near side): width and opacity multipliers.
 *  The far side stays visible (user: do not wipe the lines out). */
export const depthWidth = (n: number) => 0.55 + 1.05 * n;
export const depthAlpha = (n: number) => 0.32 + 0.68 * n ** 1.2;
const BASE_TILT = 0.32;
const TILT_TOP = -0.6;
const TILT_BOTTOM = 0.75;
// Touch drag: a full screen width turns the sphere this much (rad); a full screen height tilts it this much.
const DRAG_YAW = 3.2;
const DRAG_TILT = 2.4;
// Orbit drift (user): base tilt (ax around x, az around z), how far and how fast the tilt sways, how fast the
// plane precesses (rad/s, signs differ), and a phase so they never move in step. Slow: a full sway takes ~1 min.
const ORBIT_DRIFT = [
  { ax: 1.15, az: 0.35, sway: 0.35, swayRate: 0.11, spin: 0.045, phase: 0 },
  { ax: 0.55, az: -0.9, sway: 0.3, swayRate: 0.083, spin: -0.06, phase: 2.1 },
  { ax: 1.45, az: 1.25, sway: 0.4, swayRate: 0.067, spin: 0.035, phase: 4.2 },
];
const IDLE_MS = 3000; // 3s of rest before the hover halftone fades (user)
// Beyond this distance neither the spot (4σ) nor the ripple ring reaches.
const REACH = Math.max(4 * REVEAL_SIGMA, 10 + RIPPLE_REACH + 3 * RIPPLE_WIDTH);
// Halftone band along the orbits, as a Gaussian σ in px (narrower, user).
const BAND = 4.5;
const PHONE_BAND = 3;
// Crossing bursts (user): when two lines meet, halftone shoots out along both lines and fades away.
const MIN_CROSS_ANGLE = (28 * Math.PI) / 180; // shallower meetings are lines running side by side
const BURST_S = 1.8; // life of a full-strength wave: a slow spread (user), reaching its end as it fades out
const BURST_S_MIN = 1.0; // life of the weakest wave
const BURST_BAND = 26; // length of the wave crest along the line (σ, px; user: longer)
const BURST_BAND_PHONE = 13;
const BURST_REACH = 140; // px along each line, each way, for a full-strength wave (weak ones go ~40%)
const BURST_REACH_PHONE = 62;
const BURST_WIDTH = 4; // σ at the crossing, px
const BURST_WIDTH_PHONE = 3.2;
const BURST_INK = 1.05; // peak ink at the start ≈ full dots, so they start shrinking right away and keep going (user)
const BURST_GAP_S = 4; // a pair of lines bursts at most this often (user: rarer)
const BURST_ANY_GAP_S = 2.5; // and a new wave starts at least this long after the previous one (rare)
const MAX_BURSTS = 2;
// Phone wave dots: up to 1.8px radius (diameter stays under the 4px grid), vs 1.3px for the hover halftone.
const PHONE_BURST_MAX_R = 1.8;
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

/** Where polyline `a` crosses polyline `b` at more than `minAngle`: segment index and position in each (i,t in `a`; j,u in `b`). */
export function crossings(a: Pt[], b: Pt[], minAngle: number): { i: number; t: number; j: number; u: number; sin: number }[] {
  const out: { i: number; t: number; j: number; u: number; sin: number }[] = [];
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
      const sin = Math.abs(den) / (Math.hypot(rx, ry) * Math.hypot(sx, sy));
      if (sin < sinMin) continue;
      out.push({ i, t, j, u, sin });
    }
  }
  return out;
}

/**
 * Points along `pts` within `half` px of arc length either side of a crossing: `d` is the distance along the
 * line from the crossing, and w = 1 − (d/half)² a taper from the middle to the tips.
 */
export function strokeSamples(pts: Pt[], i: number, t: number, half: number, step: number): { x: number; y: number; w: number; d: number }[] {
  const at = (k: number, f: number) => ({ x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f });
  const out: { x: number; y: number; w: number; d: number }[] = [];
  const centre = at(i, t);
  out.push({ ...centre, w: 1, d: 0 });
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
        out.push({ x, y, w: 1 - q * q, d: next });
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

/**
 * How hard a crossing hits (user: 1 angle, 2 depth, 3 several lines), 0…~1.3:
 * steep crossings (sin of the angle, from the 28° floor up to 90°), in front of the sphere (z from −1 back
 * to +1 front), and where three or more lines meet (other crossings right next to it) burst harder.
 */
export function waveStrength(o: { sin: number; z: number; neighbours: number; minSin?: number }): number {
  const minSin = o.minSin ?? Math.sin((28 * Math.PI) / 180);
  const angle = Math.max(0, Math.min(1, (o.sin - minSin) / (1 - minSin)));
  const front = 0.5 + 0.5 * Math.max(-1, Math.min(1, o.z));
  // The curve lifts mid angles (crossings on a sphere are mostly fairly shallow) so strong waves still occur.
  const base = (0.3 + 0.7 * angle ** 0.6) * (0.55 + 0.45 * front);
  return Math.min(1.3, base * (o.neighbours > 0 ? 1.45 : 1) + (o.neighbours > 0 ? 0.15 : 0));
}

/**
 * Where marker i of n sits on its orbit (0…1) at time t. Markers share the three orbits in turn (i % 3); those on
 * the same orbit are spread evenly around it and move at the orbit's speed, so they never travel bunched up
 * (user). Each orbit starts at its own offset, and the middle orbit runs the other way.
 */
/** Which way marker i travels along its orbit: +1 towards higher point indices, −1 the other way. */
export function markerDirection(i: number): 1 | -1 {
  return i % 3 === 1 ? -1 : 1;
}

export function markerPhaseOf(i: number, n: number, t: number): number {
  const orbit = i % 3;
  const k = Math.floor(i / 3);
  const onOrbit = Math.ceil((n - orbit) / 3);
  const speed = 0.025 * (1 + orbit * 0.3) * markerDirection(i);
  const p = [0, 0.37, 0.71][orbit] + k / Math.max(1, onOrbit) + t * speed;
  return ((p % 1) + 1) % 1;
}

export type TrackedCrossing = { key: string; x: number; y: number; born: number; seen: number };

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
  let lastAnyBurst = -Infinity;
  // Running waves, fixed to a spot on two lines (indices into orbits+ellipses, segment and position on each).
  let waves: { born: number; a: number; i: number; t: number; b: number; j: number; u: number; strength: number }[] = [];
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
    const R =
      PERSPECTIVE_FIT *
      (band
        ? Math.min((band.bottom - band.top) / 2 / 1.12, w * 0.3) // 25% bigger than the first mock (user)
        : mobile
          ? w * 0.44
          : Math.min(w * 0.17, h * 0.28));
    const cx = w * 0.5;
    const cy = band ? (band.top + band.bottom) / 2 : h * 0.5;
    const yaw = pose.yaw + t * 0.08;
    const pitch = BASE_TILT + pose.pitch;
    const [cy_, sy_, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    const project = ([x, y, z]: V3) => {
      [x, z] = [x * cy_ + z * sy_, -x * sy_ + z * cy_];
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      const k = CAMERA / (CAMERA - z);
      return { x: cx + x * R * k, y: cy + y * R * k, z };
    };
    // Each orbit drifts on its own (user): its tilt sways and its plane slowly precesses, at different speeds
    // and directions, so the crossings keep moving and the halftone waves come up in new places.
    const orbits = ORBIT_DRIFT.map(({ ax, az, sway, swayRate, spin, phase }) =>
      ring(1, ax + sway * Math.sin(t * swayRate + phase), az + spin * t),
    ).map((o) => o.map(project));
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
  // Depth cue (user: perspective): the near side of a line is thicker and darker, the far side thinner and
  // lighter, but never gone. Segments are grouped into a few depth steps so each step is one path.
  const DEPTH_STEPS = 6;
  const strokeDepth = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number; z: number }[]) => {
    const lw = ctx.lineWidth;
    const ga = ctx.globalAlpha;
    for (let b = 0; b < DEPTH_STEPS; b++) {
      const n = (b + 0.5) / DEPTH_STEPS;
      ctx.lineWidth = lw * depthWidth(n);
      ctx.globalAlpha = ga * depthAlpha(n);
      ctx.beginPath();
      for (let i = 1; i < pts.length; i++) {
        const d = Math.min(DEPTH_STEPS - 1, Math.floor((((pts[i - 1].z + pts[i].z) / 2 + 1) / 2) * DEPTH_STEPS));
        if (d !== b) continue;
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
    ctx.lineWidth = lw;
    ctx.globalAlpha = ga;
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
  let dragMoved = false; // a touch drag that turned the sphere is not a tap on a marker
  window.addEventListener('click', (e) => {
    if (e.button !== 0 || interactive(e.target)) return;
    if (dragMoved) {
      dragMoved = false;
      return;
    }
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
  const markerPhase = (i: number, t: number) => markerPhaseOf(i, opts.labels.length, t);
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
    // Bursts (user): the moment two lines cross, halftone shoots out along both lines from the crossing,
    // widest there and pointed at the tips, then fades away. Nothing stays: at rest the drawing is clean.
    // Shallow crossings (lines running side by side) never burst, so the sphere's edge stays clean.
    const phone = w < 768;
    const reach = phone ? BURST_REACH_PHONE : BURST_REACH;
    const widest = phone ? BURST_WIDTH_PHONE : BURST_WIDTH;
    const step = PITCH * 0.7;
    const others = [...g.orbits, ...g.centre];
    const found: { key: string; x: number; y: number; a: Pt[]; i: number; t: number; b: Pt[]; j: number; u: number; sin: number }[] = [];
    g.orbits.forEach((orbit, oi) => {
      for (let oj = 0; oj < others.length; oj++) {
        if (oj <= oi) continue; // each orbit pair once; every orbit against both ellipses
        for (const c of crossings(orbit, others[oj], MIN_CROSS_ANGLE)) {
          const p0 = orbit[c.i - 1];
          const p1 = orbit[c.i];
          found.push({ key: `${oi}-${oj}`, x: p0.x + (p1.x - p0.x) * c.t, y: p0.y + (p1.y - p0.y) * c.t, a: orbit, i: c.i, t: c.t, b: others[oj], j: c.j, u: c.u, sin: c.sin });
        }
      }
    });
    const track = trackCrossings(memory, found, t);
    memory = track.memory;
    // Calm and rare (user): a pair of lines bursts at most once per BURST_GAP_S, a new wave starts at least
    // BURST_ANY_GAP_S after the last, and at most MAX_BURSTS run at once.
    if (!opts.reducedMotion) {
      found.forEach((c, n) => {
        if (t !== track.now[n].born) return; // only at the moment of crossing
        const last = lastRipple.get(c.key) ?? -Infinity;
        if (t - last < BURST_GAP_S || t - lastAnyBurst < BURST_ANY_GAP_S || waves.length >= MAX_BURSTS) return;
        lastRipple.set(c.key, t);
        lastAnyBurst = t;
        // A wave stays fixed to its spot on both lines, so it keeps travelling even after they part.
        const [oi, oj] = c.key.split('-').map(Number);
        // Strength (user: 1 angle, 2 depth, 3 several lines) sets how far, how long and how dark it goes.
        const za = (c.a[c.i] as { z?: number }).z ?? 0;
        const zb = (c.b[c.j] as { z?: number }).z ?? 0;
        const near = phone ? 10 : 18;
        const neighbours = found.filter((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < near).length;
        const strength = waveStrength({ sin: c.sin, z: (za + zb) / 2, neighbours });
        waves.push({ born: t, a: oi, i: c.i, t: c.t, b: oj, j: c.j, u: c.u, strength });
        dots.dataset.lastBurst = `${Math.round(c.x)},${Math.round(c.y)}`;
        dots.dataset.lastStrength = strength.toFixed(2);
        dots.dataset.lastNeighbours = String(neighbours);
      });
    }
    const lifeOf = (v: { strength: number }) => BURST_S_MIN + (BURST_S - BURST_S_MIN) * Math.min(1.3, v.strength * 1.5);
    waves = waves.filter((v) => t - v.born < lifeOf(v));
    for (const v of waves) {
      // Typical strengths run ~0.2–0.7; stretch them so weak waves stay short and faint and strong ones go far.
      const sv = Math.min(1.3, v.strength * 1.5);
      const reachV = reach * (0.4 + 0.6 * sv); // weak ≈ 40% of the reach, strong 100%, three lines ~120%
      const inkV = BURST_INK * (0.6 + 0.4 * Math.min(1, sv)); // weak waves stay small and faint but visible
      // A wave (user): it starts at the crossing, its front travels out along both lines, and the middle
      // empties first. The front eases out to `reach`; the band thins and fades as it goes.
      const k01 = (t - v.born) / lifeOf(v);
      const front = reachV * (1 - (1 - k01) ** 2);
      const band = Math.max(step * 1.2, (phone ? BURST_BAND_PHONE : BURST_BAND) * (0.7 + 0.3 * Math.min(1, sv)) * (1 - 0.5 * k01));
      const len = Math.min(reachV + band, front + 2.5 * band);
      for (const [line, k, f] of [[others[v.a], v.i, v.t], [others[v.b], v.j, v.u]] as const) {
        for (const p of strokeSamples(line, k, f, len, step)) {
          const off = (p.d - front) / band;
          const wave = Math.exp(-0.5 * off * off);
          if (wave < 0.03) continue;
          // Never thinner than ~0.6 of the dot grid, or the wave falls between grid cells and vanishes early.
          const radius = Math.max(PITCH * 0.6, widest * (0.35 + 0.65 * (1 - k01)));
          // Ink falls steadily over the whole life, so the dots shrink gradually, not only at the end (user).
          splat(p.x, p.y, ((wave * step) / (radius * Math.sqrt(2 * Math.PI))) * inkV * (1 - k01), radius);
        }
      }
    }
    dots.dataset.crossings = String(found.length);
    dots.dataset.bursts = String(waves.length);
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
        // Burst ink is drawn darker than the hover halftone so a short burst still reads (user: 팍 퍼지고).
        const burst = a;
        if (subtle) {
          // Phones show the wave ink at full strength; desktop keeps it a touch lighter.
          const base = a * (w < 768 ? 1 : 0.75);
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
        // Bit 0: burst colour when the burst carries most of this dot's ink.
        const dark = burst * (w < 768 ? 1 : 0.75) >= a * 0.5 && burst > 0.05 ? 1 : 0;
        // On phones the crossing waves may grow larger dots than the hover halftone, or they barely show (user).
        const top = dark && w < 768 ? PHONE_BURST_MAX_R : max;
        const rq = Math.round((MIN_R + (top - MIN_R) * Math.pow(Math.max(0, a - 0.12) / 0.88, 0.85)) * 4); // quarter-px steps
        // Outermost dots fade in instead of popping on at a hard threshold (no visible ring).
        const fade = Math.min(1, (a - 0.06) / 0.2);
        // Fade (user): further from a stroke's middle the dots get lighter as well as smaller.
        const aq = Math.round((0.12 + 0.88 * Math.pow(a, 1.1)) * fade * fade * (3 - 2 * fade) * 12); // 12 alpha steps
        if (!aq) continue;
        const key = (rq * 16 + aq) * 2 + dark;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(xx * PITCH + PITCH / 2, yy * PITCH + PITCH / 2);
      }
    const sizes = new Set<number>();
    let biggestBurstDot = 0; // px radius, for tests
    let burstDotSum = 0;
    let burstDotCount = 0;
    for (const [packed, list] of buckets) {
      const key = packed >> 1;
      sizes.add(key >> 4);
      if (packed & 1) {
        biggestBurstDot = Math.max(biggestBurstDot, (key >> 4) / 4);
        burstDotSum += ((key >> 4) / 4) * (list.length / 2);
        burstDotCount += list.length / 2;
      }
      dctx.fillStyle = packed & 1 ? (opts.burstColor ?? opts.dotColor) : opts.dotColor;
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
    dots.dataset.burstDot = String(biggestBurstDot);
    dots.dataset.burstDotMean = burstDotCount ? (burstDotSum / burstDotCount).toFixed(2) : '0';
    dots.dataset.maxR = String(max);
    dots.dataset.minR = String(MIN_R);
    dots.dataset.pitch = String(PITCH);
    dots.dataset.ink = 'bursts';
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
      lctx.arc(g.cx, g.cy, g.R * SILHOUETTE, 0, TAU);
      lctx.stroke();
      for (const o of g.orbits) strokeDepth(lctx, o);
      for (const o of g.centre) strokeDepth(lctx, o);
      lctx.setLineDash([2, 4]);
      for (const o of g.dashed) strokeDepth(lctx, o);
      lctx.setLineDash([]);
      // Thin latitude/longitude wireframe gives the sphere its form.
      lctx.globalAlpha = 0.3;
      lctx.lineWidth = 0.6;
      for (const o of g.wire) strokeDepth(lctx, o);
      lines.dataset.wire = 'latlong';
      // Dotted straight guides through the centre: the diagonals (the axes were removed, user).
      lctx.globalAlpha = 0.7;
      lctx.setLineDash([1, 4]);
      let dotted = 0;
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        const L = g.R * SILHOUETTE * 0.98;
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
      lines.dataset.axes = 'none';
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
        // The arrow points the way the marker actually travels (user: some pointed backwards).
        const q = orbit[(Math.floor(f * n) + 2 * markerDirection(i) + n) % n];
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
    // The fitted radius, as before the perspective change (the outline itself is ~3% larger).
    dots.dataset.r = String(Math.round(g.R / PERSPECTIVE_FIT));
    dots.dataset.pose = `${pose.yaw.toFixed(2)},${pose.pitch.toFixed(2)}`;
    dots.dataset.tilt = (BASE_TILT + pose.pitch).toFixed(2);
    dots.dataset.orbitDrift = ORBIT_DRIFT.map((o) => `${(o.ax + o.sway * Math.sin(t * o.swayRate + o.phase)).toFixed(3)}/${(o.az + o.spin * t).toFixed(3)}`).join(' ');
  };

  resize();
  const ro = new ResizeObserver(() => {
    resize();
    if (opts.reducedMotion) draw(0);
  });
  ro.observe(dots);
  // JUWON's height changes when the display font loads.
  if (opts.band) ro.observe(opts.band.below);
  // Phones: the band's top (the readout under JUWON) can move without anything resizing; the page
  // fires a resize after placing it.
  window.addEventListener('resize', () => {
    resize();
    if (opts.reducedMotion) draw(0);
  });

  if (opts.reducedMotion) {
    dots.toggleAttribute('data-static', true);
    draw(0);
    return;
  }

  // Touch (user): drag to turn the sphere — sideways turns it, up/down tilts it to show the top or bottom.
  // It stays where it was left and keeps its slow spin.
  let drag: { x: number; y: number; ty: number; tp: number } | null = null;
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || interactive(e.target)) return;
      drag = { x: e.clientX, y: e.clientY, ty: pose.ty, tp: pose.tp };
      dragMoved = false;
    },
    { passive: true },
  );
  const endDrag = () => (drag = null);
  window.addEventListener('pointerup', endDrag, { passive: true });
  window.addEventListener('pointercancel', endDrag, { passive: true });
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 8) dragMoved = true;
        pose.ty = drag.ty + (dx / window.innerWidth) * DRAG_YAW;
        // Dragging down pulls the front down and shows the top (like turning a globe with a finger).
        pose.tp = Math.max(TILT_TOP - BASE_TILT, Math.min(TILT_BOTTOM - BASE_TILT, drag.tp - (dy / window.innerHeight) * DRAG_TILT));
      } else {
        pose.ty = (e.clientX / window.innerWidth - 0.5) * 1.0;
        // Up/down tilt: the resting tilt (0.32) already looks slightly from below, so the pointer must swing
        // further up than down for the top to show as clearly as the bottom (user): top −0.6, bottom +0.75.
        const yn = e.clientY / window.innerHeight;
        pose.tp = yn < 0.5 ? (0.5 - yn) * 2 * (TILT_TOP - BASE_TILT) : (yn - 0.5) * 2 * (TILT_BOTTOM - BASE_TILT);
      }
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
