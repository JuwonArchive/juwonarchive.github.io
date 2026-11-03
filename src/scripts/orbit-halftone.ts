/**
 * Orbit halftone.
 * 1. A 3D orbital line drawing (sphere silhouette, tilted orbits, dashed meridians, centre ellipses)
 *    is drawn thick into a small offscreen buffer and blurred.
 * 2. That buffer is read through a halftone screen: darker → bigger dot. A faint fine-dot grid covers
 *    the rest of the page.
 * 3. A crisp, thin version of the same drawing sits on a second canvas with markers labelled by tools.
 * Rotates slowly and turns toward the pointer; draws once for reduced-motion visitors.
 */
type Opts = {
  dots: HTMLCanvasElement;
  lines: HTMLCanvasElement | null;
  dotColor: string;
  lineColor: string;
  labels: string[];
  reducedMotion: boolean;
};

type V3 = [number, number, number];

const TAU = Math.PI * 2;
const SCALE = 3; // offscreen buffer is 1/3 of the screen
const PITCH = 9; // halftone cell, CSS px

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

export function mountOrbitHalftone(opts: Opts) {
  const { dots, lines } = opts;
  const dctx = dots.getContext('2d');
  const lctx = lines?.getContext('2d') ?? null;
  if (!dctx) return;
  dots.dataset.form = 'orbit';
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true })!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  const pose = { yaw: 0, pitch: 0, ty: 0, tp: 0 };
  const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: 0, ton: 0 };
  dots.dataset.dotColor = opts.dotColor;

  const resize = () => {
    w = dots.clientWidth;
    h = dots.clientHeight;
    for (const c of [dots, lines]) {
      if (!c) continue;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    off.width = Math.ceil(w / SCALE);
    off.height = Math.ceil(h / SCALE);
  };

  const geometry = (t: number) => {
    const mobile = w < 768;
    const R = mobile ? w * 0.44 : Math.min(w * 0.24, h * 0.38);
    const cx = w * (mobile ? 0.5 : 0.55);
    const cy = h * 0.5; // centred on phones and desktop
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

  const draw = (t: number) => {
    const g = geometry(t);

    // 1. Thick, blurred drawing in the offscreen buffer.
    const k = 1 / SCALE;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, off.width, off.height);
    octx.filter = 'blur(2.5px)';
    octx.strokeStyle = '#000';
    octx.lineCap = 'round';
    octx.lineWidth = 4.5;
    octx.beginPath();
    octx.arc(g.cx * k, g.cy * k, g.R * k, 0, TAU);
    octx.stroke();
    // Orbit segments: darker in front, fainter behind, with a slow pulse travelling along each line.
    g.orbits.forEach((o, oi) => {
      for (let i = 1; i < o.length; i++) {
        const a = o[i - 1];
        const b = o[i];
        const front = 0.5 + 0.5 * Math.max(-1, Math.min(1, (a.z + b.z) / 2));
        const pulse = 0.55 + 0.45 * Math.sin(i * 0.12 - t * 1.4 + oi * 2);
        octx.globalAlpha = 0.25 + 0.75 * front * pulse;
        octx.lineWidth = 2.5 + 3.5 * front;
        octx.beginPath();
        octx.moveTo(a.x * k, a.y * k);
        octx.lineTo(b.x * k, b.y * k);
        octx.stroke();
      }
    });
    octx.globalAlpha = 1;
    octx.lineWidth = 3;
    for (const o of g.centre) stroke(octx, o, k);
    octx.globalAlpha = 0.45;
    for (const o of g.dashed) stroke(octx, o, k);
    // Pointer: a soft glow in the buffer makes nearby dots swell.
    if (ptr.on > 0.01) {
      octx.globalAlpha = 0.9 * ptr.on;
      const gr = octx.createRadialGradient(ptr.x * k, ptr.y * k, 0, ptr.x * k, ptr.y * k, 120 * k);
      gr.addColorStop(0, '#000');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = gr;
      octx.fillRect(0, 0, off.width, off.height);
    }
    octx.globalAlpha = 1;
    octx.filter = 'none';
    const img = octx.getImageData(0, 0, off.width, off.height).data;

    // 2. Halftone screen.
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.clearRect(0, 0, w, h);
    dctx.fillStyle = opts.dotColor;
    const max = PITCH * 0.5;
    const steps = new Set<number>();
    for (let y = PITCH / 2; y < h; y += PITCH) {
      for (let x = PITCH / 2; x < w; x += PITCH) {
        const ox = Math.min(off.width - 1, Math.floor(x / SCALE));
        const oy = Math.min(off.height - 1, Math.floor(y / SCALE));
        const a = img[(oy * off.width + ox) * 4 + 3] / 255;
        // Size follows intensity smoothly; a faint fine grid covers the rest.
        const r = a > 0.02 ? 0.6 + (max - 0.6) * Math.pow(a, 0.85) : 0.5;
        if (a > 0.02) steps.add(Math.round(r * 4));
        dctx.globalAlpha = a > 0.02 ? 0.45 + 0.55 * a : 0.3;
        dctx.beginPath();
        dctx.arc(x, y, r, 0, TAU);
        dctx.fill();
      }
    }
    dctx.globalAlpha = 1;
    dots.dataset.sizeSteps = String(steps.size);

    // 3. Crisp thin line art, markers and labels.
    if (lctx && lines) {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);
      lctx.strokeStyle = lctx.fillStyle = opts.lineColor;
      lctx.lineWidth = 0.8;
      lctx.globalAlpha = 0.55;
      lctx.beginPath();
      lctx.arc(g.cx, g.cy, g.R, 0, TAU);
      lctx.stroke();
      for (const o of g.orbits) stroke(lctx, o);
      for (const o of g.centre) stroke(lctx, o);
      lctx.setLineDash([2, 4]);
      for (const o of g.dashed) stroke(lctx, o);
      lctx.setLineDash([]);
      // Thin latitude/longitude wireframe gives the sphere its form.
      lctx.globalAlpha = 0.16;
      lctx.lineWidth = 0.6;
      for (const o of g.wire) stroke(lctx, o);
      lines.dataset.wire = 'latlong';
      // Dotted straight guides through the centre: axes and diagonals.
      lctx.globalAlpha = 0.5;
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
      lctx.globalAlpha = 0.55;
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
      // Markers travel along the orbits.
      lctx.globalAlpha = 0.85;
      lctx.font = '10px "Geist Mono Variable", ui-monospace, monospace';
      const shown: string[] = [];
      opts.labels.forEach((label, i) => {
        const orbit = g.orbits[i % g.orbits.length];
        const n = orbit.length - 1;
        const f = ((i * 0.27 + t * 0.025 * (1 + (i % 3) * 0.3)) % 1 + 1) % 1;
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
        const text = label.toUpperCase();
        // Keep labels on screen: flip to the side with room.
        const tw = lctx.measureText(text).width;
        const right = p.x >= g.cx ? p.x + 10 + tw < w - 8 : p.x - 10 - tw < 8;
        lctx.textAlign = right ? 'left' : 'right';
        lctx.fillText(text, p.x + (right ? 10 : -10), p.y - 8);
        shown.push(label);
      });
      lctx.globalAlpha = 1;
      lines.dataset.labels = JSON.stringify(shown);
    }
    dots.dataset.cy = String(Math.round(g.cy));
    dots.dataset.pose = `${pose.yaw.toFixed(2)},${pose.pitch.toFixed(2)}`;
  };

  resize();
  new ResizeObserver(() => {
    resize();
    if (opts.reducedMotion) draw(0);
  }).observe(dots);

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
      if (ptr.x < -1000) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
    },
    { passive: true },
  );

  let last = 0;
  const start = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    pose.yaw += (pose.ty - pose.yaw) * 0.08;
    pose.pitch += (pose.tp - pose.pitch) * 0.08;
    ptr.x += (ptr.tx - ptr.x) * 0.2;
    ptr.y += (ptr.ty - ptr.y) * 0.2;
    ptr.on += (ptr.ton - ptr.on) * 0.1;
    draw(Math.max(0, (now - start) / 1000));
  };
  requestAnimationFrame(loop);
}
