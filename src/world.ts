import * as THREE from "three";

export type Chapter = "hero" | "value" | "capability" | "invite";

export type WorldState = {
  chapter: Chapter;
  t: number;
};

const STAR_COUNT = 2400;
const MORPH_COUNT = 5200;
const EARTH_COUNT = 7800;
const LINE_COUNT = 1600;

export class InviteWorld {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 9 / 16, .4, 2400);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly sprite: THREE.CanvasTexture;
  private readonly stars: THREE.Points;
  private readonly morph: THREE.Points;
  private readonly earth: THREE.Points;
  private readonly lines: THREE.LineSegments;
  private readonly sun: THREE.Sprite;
  private readonly starPos: Float32Array;
  private readonly morphLive: Float32Array;
  private readonly morphTargets: Float32Array[];
  private readonly earthHome: Float32Array;
  private readonly earthScatter: Float32Array;
  private readonly earthColor: Float32Array;
  private raf = 0;
  private state: WorldState = { chapter: "hero", t: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.camera.position.set(0, .4, 28);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.sprite = makeSoftSprite();

    this.starPos = new Float32Array(STAR_COUNT * 3);
    this.stars = makePoints(this.starPos, {
      size: 18,
      map: this.sprite,
      opacity: .85,
      color: 0xcfe8ff
    });
    seedStars(this.starPos);

    this.morphTargets = [
      sampleCrest(MORPH_COUNT),
      sampleTorus(MORPH_COUNT),
      sampleHarvest(MORPH_COUNT),
      samplePlatform(MORPH_COUNT)
    ];
    this.morphLive = this.morphTargets[0].slice();
    this.morph = makePoints(this.morphLive, {
      size: 9,
      map: this.sprite,
      opacity: 0,
      color: 0xd7ecff
    });

    const earth = sampleEarth(EARTH_COUNT);
    this.earthHome = earth.pos;
    this.earthColor = earth.color;
    this.earthScatter = scatterFrom(this.earthHome, 46);
    this.earth = makeColoredPoints(this.earthScatter.slice(), this.earthColor, {
      size: 11,
      map: this.sprite,
      opacity: 0
    });
    this.earth.rotation.x = .18;

    this.lines = makeEarthLines(this.earthHome, LINE_COUNT);
    this.lines.rotation.x = .18;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0;

    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.sprite,
      color: 0xff9a2a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0
    }));
    this.sun.scale.set(18, 18, 1);
    this.sun.position.set(8.4, .6, -6);

    this.scene.fog = new THREE.FogExp2(0x04070c, .018);
    this.scene.add(this.stars, this.morph, this.earth, this.lines, this.sun);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.animate();
  }

  setState(next: WorldState): void {
    this.state = next;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.sprite.dispose();
    this.renderer.dispose();
  }

  readonly resize = (): void => {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
  };

  private readonly animate = (): void => {
    const dt = Math.min(this.clock.getDelta(), .033);
    const now = this.clock.elapsedTime;
    const { chapter, t } = this.state;

    this.updateStars(dt, chapter, t);
    this.updateMorph(dt, chapter, t);
    this.updateEarth(dt, now, chapter, t);
    this.updateCamera(now, chapter, t);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };

  private updateStars(dt: number, chapter: Chapter, t: number): void {
    const warp = chapter === "value" ? .55 + t * 1.4 : chapter === "hero" ? .22 : .08;
    const pos = this.starPos;
    for (let i = 0; i < STAR_COUNT; i++) {
      const z = i * 3 + 2;
      pos[z] += (18 + warp * 92) * dt;
      if (pos[z] > 40) {
        pos[i * 3] = (Math.random() - .5) * 80;
        pos[i * 3 + 1] = (Math.random() - .5) * 54;
        pos[z] = -90 - Math.random() * 40;
      }
    }
    this.stars.geometry.attributes.position.needsUpdate = true;
    const mat = this.stars.material as THREE.PointsMaterial;
    mat.opacity = chapter === "value" ? .28 + t * .4 : chapter === "hero" ? .12 : .08;
    mat.size = chapter === "value" ? 16 + t * 10 : 12;
  }

  private updateMorph(dt: number, chapter: Chapter, t: number): void {
    const mat = this.morph.material as THREE.PointsMaterial;
    const show = chapter === "capability";
    mat.opacity += ((show ? .92 : 0) - mat.opacity) * .1;
    if (!show && mat.opacity < .02) return;

    const step = Math.min(3, Math.floor(t * 4));
    const local = t * 4 - step;
    const from = this.morphTargets[step];
    const to = this.morphTargets[Math.min(3, step + 1)];
    const live = this.morphLive;
    const ease = 1 - Math.pow(1 - local, 2.4);
    const burst = Math.sin(local * Math.PI) * 1.8;
    for (let i = 0; i < live.length; i += 3) {
      const nx = from[i] + (to[i] - from[i]) * ease;
      const ny = from[i + 1] + (to[i + 1] - from[i + 1]) * ease;
      const nz = from[i + 2] + (to[i + 2] - from[i + 2]) * ease;
      live[i] += (nx * (1 + burst * .08) - live[i]) * Math.min(1, dt * 7);
      live[i + 1] += (ny - live[i + 1]) * Math.min(1, dt * 7);
      live[i + 2] += (nz * (1 + burst * .12) - live[i + 2]) * Math.min(1, dt * 7);
    }
    this.morph.geometry.attributes.position.needsUpdate = true;
    this.morph.rotation.y += dt * (.08 + (1 - Math.abs(local - .5) * 2) * .2);
    mat.size = 8 + burst * 4;
  }

  private updateEarth(dt: number, now: number, chapter: Chapter, t: number): void {
    const show = chapter === "invite";
    const mat = this.earth.material as THREE.PointsMaterial;
    const lineMat = this.lines.material as THREE.LineBasicMaterial;
    mat.opacity += ((show ? .95 : 0) - mat.opacity) * .08;
    lineMat.opacity += ((show ? .16 + t * .18 : 0) - lineMat.opacity) * .08;
    const sunMat = this.sun.material as THREE.SpriteMaterial;
    sunMat.opacity += ((show ? .22 + t * .55 : 0) - sunMat.opacity) * .08;
    if (!show && mat.opacity < .02) return;

    const gather = smooth(t);
    const live = this.earth.geometry.attributes.position.array as Float32Array;
    const home = this.earthHome;
    const scatter = this.earthScatter;
    for (let i = 0; i < live.length; i++) {
      live[i] += (home[i] * (1 - (1 - gather) * .04) + scatter[i] * (1 - gather) - live[i]) * Math.min(1, dt * 5.2);
    }
    this.earth.geometry.attributes.position.needsUpdate = true;
    this.earth.rotation.y = now * .04 + t * .35;
    this.lines.rotation.y = this.earth.rotation.y;
    this.earth.rotation.x = .16 + t * .08;
    this.lines.rotation.x = this.earth.rotation.x;
    mat.size = 14 - gather * 7.2;
    this.sun.position.set(7.6 + t * 1.6, .2 + t * .4, -5.5);
    this.sun.scale.setScalar(14 + t * 10);
  }

  private updateCamera(now: number, chapter: Chapter, t: number): void {
    const sway = Math.sin(now * .22) * .12;
    if (chapter === "hero") {
      this.camera.position.set(sway * .4, .2, 32);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    if (chapter === "value") {
      this.camera.position.set(-1.4 + sway, .15 + t * .2, 16 - t * 2.4);
      this.camera.lookAt(.6, -.1 + t * .4, 0);
      return;
    }
    if (chapter === "capability") {
      this.camera.position.set(sway * .8, .1, 20 - t * 3.2);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    this.camera.position.set(-1.2 + t * .8 + sway * .2, 1.8 - t * .55, 26 - t * 14.5);
    this.camera.lookAt(0, -.8 - t * .4, 0);
  }
}

function makePoints(positions: Float32Array, opts: {
  size: number;
  map: THREE.Texture;
  opacity: number;
  color: number;
}): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: opts.size,
    map: opts.map,
    color: opts.color,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  return new THREE.Points(geometry, material);
}

function makeColoredPoints(positions: Float32Array, colors: Float32Array, opts: {
  size: number;
  map: THREE.Texture;
  opacity: number;
}): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: opts.size,
    map: opts.map,
    vertexColors: true,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  return new THREE.Points(geometry, material);
}

function makeSoftSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(.28, "rgba(210,236,255,.85)");
    g.addColorStop(.7, "rgba(140,196,255,.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seedStars(pos: Float32Array): void {
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (Math.random() - .5) * 80;
    pos[i + 1] = (Math.random() - .5) * 54;
    pos[i + 2] = -90 + Math.random() * 130;
  }
}

function sampleCrest(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ring = i / count;
    if (ring < .45) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 3.4;
      out[i * 3] = Math.cos(a) * r;
      out[i * 3 + 1] = Math.sin(a) * r * .72;
      out[i * 3 + 2] = (Math.random() - .5) * 1.2;
    } else if (ring < .75) {
      const a = Math.random() * Math.PI * 2;
      const r = .4 + Math.random() * 1.1;
      out[i * 3] = Math.cos(a) * r;
      out[i * 3 + 1] = Math.sin(a) * r + (Math.random() - .5) * 4.6;
      out[i * 3 + 2] = (Math.random() - .5) * .8;
    } else {
      out[i * 3] = (Math.random() - .5) * 16;
      out[i * 3 + 1] = (Math.random() - .5) * 10;
      out[i * 3 + 2] = (Math.random() - .5) * 8;
    }
  }
  return out;
}

function sampleTorus(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    const R = 3.4;
    const r = .72 + (i % 7 === 0 ? 1.1 : 0);
    out[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
    out[i * 3 + 1] = r * Math.sin(v) * .55;
    out[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
    if (i % 11 === 0) {
      out[i * 3] *= 1.8;
      out[i * 3 + 2] *= 1.8;
    }
  }
  return out;
}

function sampleHarvest(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const col = (i % 28) - 13.5;
    const row = Math.floor(i / 28) % 36 - 18;
    out[i * 3] = col * .38 + (Math.random() - .5) * .12;
    out[i * 3 + 1] = Math.sin(col * .28 + row * .12) * .55 + (Math.random() - .5) * .2;
    out[i * 3 + 2] = row * .32 + (Math.random() - .5) * .12;
  }
  return out;
}

function samplePlatform(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / (count / 6));
    const a = (i / count) * Math.PI * 18;
    const r = 1.1 + layer * .55 + (i % 5 === 0 ? 1.6 : 0);
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = layer * .42 - 1.1 + Math.sin(a * .5) * .12;
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
}

function sampleEarth(count: number): { pos: Float32Array; color: Float32Array } {
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const radius = 6.4;
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const bias = Math.pow(v, .62);
    const phi = Math.acos(1 - 1.55 * bias);
    const jitter = 1 + (Math.random() - .5) * .012;
    const x = radius * Math.sin(phi) * Math.cos(theta) * jitter;
    const y = radius * Math.cos(phi) * jitter - 1.8;
    const z = radius * Math.sin(phi) * Math.sin(theta) * jitter;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const limb = Math.pow(Math.max(0, Math.sin(phi)), 1.6);
    const sun = Math.max(0, x / radius);
    color[i * 3] = .42 + limb * .35 + sun * .55;
    color[i * 3 + 1] = .62 + limb * .28 + sun * .18;
    color[i * 3 + 2] = .95 - sun * .55;
  }
  return { pos, color };
}

function scatterFrom(home: Float32Array, spread: number): Float32Array {
  const out = home.slice();
  for (let i = 0; i < out.length; i += 3) {
    const s = .6 + Math.random() * spread;
    out[i] *= s;
    out[i + 1] *= s * .7;
    out[i + 2] *= s;
  }
  return out;
}

function makeEarthLines(home: Float32Array, count: number): THREE.LineSegments {
  const pos = new Float32Array(count * 6);
  let written = 0;
  let tries = 0;
  while (written < count && tries < count * 24) {
    tries += 1;
    const a = Math.floor(Math.random() * (home.length / 3)) * 3;
    const b = Math.floor(Math.random() * (home.length / 3)) * 3;
    const dx = home[a] - home[b];
    const dy = home[a + 1] - home[b + 1];
    const dz = home[a + 2] - home[b + 2];
    if (dx * dx + dy * dy + dz * dz > 3.6) continue;
    pos[written * 6] = home[a];
    pos[written * 6 + 1] = home[a + 1];
    pos[written * 6 + 2] = home[a + 2];
    pos[written * 6 + 3] = home[b];
    pos[written * 6 + 4] = home[b + 1];
    pos[written * 6 + 5] = home[b + 2];
    written += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x7eb6ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  return new THREE.LineSegments(geometry, material);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
