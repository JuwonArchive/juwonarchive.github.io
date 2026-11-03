import {
  ACESFilmicToneMapping,
  Color,
  Clock,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  PlaneGeometry,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type ChromeHero = { dispose(): void };

type Artifact = { object: Group; update(t: number): void; dispose(): void };

/**
 * The hero artifact: a frosted acrylic cube (matching the ARCHIVE boxes) holding a slowly
 * morphing liquid metal with an iridescent, thin-film sheen, plus a few drifting droplets.
 */
function createArtifact(): Artifact {
  const group = new Group();

  const glass = new MeshPhysicalMaterial({
    color: 0xf4f3fb,
    metalness: 0.1,
    roughness: 0.18,
    transparent: true,
    opacity: 0.22,
    clearcoat: 1,
    side: DoubleSide,
    depthWrite: false,
  });
  const cube = new Mesh(new RoundedBoxGeometry(2.3, 2.3, 2.3, 8, 0.25), glass);
  cube.renderOrder = 2;

  const liquid = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    iridescence: 1,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [100, 1100],
  });

  const blobGeo = new SphereGeometry(0.72, 128, 96);
  const base = Float32Array.from(blobGeo.attributes.position.array as Float32Array);
  const blob = new Mesh(blobGeo, liquid);

  const droplets = [0.09, 0.065, 0.05].map((r, i) => {
    const d = new Mesh(new SphereGeometry(r, 48, 32), liquid);
    d.userData = { radius: 0.78 + i * 0.12, speed: 0.35 + i * 0.17, phase: i * 2.1, tilt: 0.6 - i * 0.45 };
    return d;
  });

  group.add(blob, ...droplets, cube);

  const v = new Vector3();
  const pos = blobGeo.attributes.position;
  const update = (t: number) => {
    // Layered sine waves over the sphere: slow, breathing, never repeating exactly.
    for (let i = 0; i < pos.count; i++) {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      const n = v.clone().normalize();
      const d =
        0.13 * Math.sin(n.x * 3.0 + t * 0.9) * Math.cos(n.y * 2.6 + t * 0.7) +
        0.08 * Math.sin(n.z * 4.1 + n.x * 2.0 + t * 1.3) +
        0.045 * Math.sin(n.y * 6.0 + t * 1.7);
      v.addScaledVector(n, d);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    blobGeo.computeVertexNormals();
    blob.rotation.y = t * 0.12;
    blob.rotation.x = Math.sin(t * 0.21) * 0.3;
    for (const d of droplets) {
      const { radius, speed, phase, tilt } = d.userData as { radius: number; speed: number; phase: number; tilt: number };
      const a = t * speed + phase;
      d.position.set(Math.cos(a) * radius, Math.sin(a * 1.3) * tilt, Math.sin(a) * radius);
    }
  };
  update(0);

  return {
    object: group,
    update,
    dispose() {
      group.traverse((o) => {
        if ((o as Mesh).geometry) (o as Mesh).geometry.dispose();
      });
      glass.dispose();
      liquid.dispose();
    },
  };
}

/** The studio the metal reflects: a neutral room plus soft lavender, mint and pink light panels. */
function dreamyRoom(): RoomEnvironment {
  const room = new RoomEnvironment();
  const panels: [string, [number, number, number], [number, number, number]][] = [
    ['#9d86ff', [-4.5, 2, 1], [0, Math.PI / 2, 0]],
    ['#5ff2b8', [4.5, -1, 1.5], [0, -Math.PI / 2, 0]],
    ['#ff7ac8', [0, 4.5, -1], [Math.PI / 2, 0, 0]],
    ['#7fd3ff', [0, -4.5, 2], [-Math.PI / 2, 0, 0]],
  ];
  for (const [hex, p, r] of panels) {
    const m = new Mesh(new PlaneGeometry(7, 7), new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(9), side: DoubleSide }));
    m.position.set(...p);
    m.rotation.set(...r);
    room.add(m);
  }
  return room;
}

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

export function mountChromeHero(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): ChromeHero | null {
  if (!webglAvailable()) return null;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const pmrem = new PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(dreamyRoom(), 0.04).texture;
  scene.environment = roomEnv;

  const artifact = createArtifact();
  const obj = artifact.object;
  scene.add(obj);

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const target = { x: -0.45, y: 0.65 };
  const clock = new Clock();
  let frame = 0;
  let disposed = false;

  const render = () => renderer.render(scene, camera);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    obj.scale.setScalar(Math.min(1, camera.aspect) * 0.95);
    camera.updateProjectionMatrix();
    render();
  };

  const onPointer = (e: PointerEvent) => {
    target.y = 0.65 + (e.clientX / window.innerWidth - 0.5) * 1.2;
    target.x = -0.45 + (e.clientY / window.innerHeight - 0.5) * 0.7;
  };

  const loop = () => {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (touch) {
      obj.rotation.y += 0.15 * dt;
    } else {
      obj.rotation.x += (target.x - obj.rotation.x) * Math.min(1, dt * 2.5);
      obj.rotation.y += (target.y - obj.rotation.y) * Math.min(1, dt * 2.5);
    }
    artifact.update(clock.elapsedTime);
    render();
    frame = requestAnimationFrame(loop);
  };

  obj.rotation.set(target.x, target.y, 0);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (!opts.reducedMotion) {
    if (!touch) window.addEventListener('pointermove', onPointer, { passive: true });
    frame = requestAnimationFrame(loop);
  }
  resize();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      artifact.dispose();
      roomEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
