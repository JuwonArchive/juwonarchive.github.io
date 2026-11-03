import {
  ACESFilmicToneMapping,
  Clock,
  EquirectangularReflectionMapping,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  TorusKnotGeometry,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ChromeHero = { setReflection(url: string | null): void; dispose(): void };

/** The hero object. Swap this for a GLTF mesh exported from Blender later. */
function createShape(): Mesh {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  return new Mesh(new TorusKnotGeometry(1, 0.32, 256, 48), material);
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
  const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv;

  const mesh = createShape();
  scene.add(mesh);

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const target = { x: 0.35, y: -0.5 };
  const clock = new Clock();
  let frame = 0;
  let disposed = false;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the object about 45% of the shorter side.
    const fit = Math.min(1, camera.aspect) * 0.95;
    mesh.scale.setScalar(fit);
    camera.updateProjectionMatrix();
    render();
  };

  const render = () => renderer.render(scene, camera);

  const onPointer = (e: PointerEvent) => {
    target.y = (e.clientX / window.innerWidth - 0.5) * 1.6;
    target.x = (e.clientY / window.innerHeight - 0.5) * 1.0;
  };

  const loop = () => {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (touch) {
      mesh.rotation.y += 0.15 * dt;
      mesh.rotation.x += 0.05 * dt;
    } else {
      mesh.rotation.x += (target.x - mesh.rotation.x) * Math.min(1, dt * 2.5);
      mesh.rotation.y += (target.y - mesh.rotation.y) * Math.min(1, dt * 2.5);
      mesh.rotation.z += 0.08 * dt;
    }
    render();
    frame = requestAnimationFrame(loop);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (!opts.reducedMotion) {
    if (!touch) window.addEventListener('pointermove', onPointer, { passive: true });
    frame = requestAnimationFrame(loop);
  }
  mesh.rotation.set(target.x, target.y, 0);
  resize();

  const loader = new TextureLoader();
  const envCache = new Map<string, Texture>();
  let wanted: string | null = null;

  return {
    setReflection(url) {
      wanted = url;
      canvas.dataset.reflection = url ?? '';
      if (!url) {
        scene.environment = roomEnv;
        render();
        return;
      }
      const cached = envCache.get(url);
      if (cached) {
        scene.environment = cached;
        render();
        return;
      }
      loader.load(url, (tex) => {
        tex.mapping = EquirectangularReflectionMapping;
        tex.colorSpace = SRGBColorSpace;
        const env = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
        envCache.set(url, env);
        if (wanted === url && !disposed) {
          scene.environment = env;
          render();
        }
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      for (const t of envCache.values()) t.dispose();
      roomEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
