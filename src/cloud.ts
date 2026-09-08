import * as THREE from "three";

const BLUE = new THREE.Color("#0066ff");
const BLUE_HOT = new THREE.Color("#3d88ff");
const ORANGE = new THREE.Color("#f07310");
const ORANGE_HOT = new THREE.Color("#f07310");
const GAL_CORE = new THREE.Color("#fff4c2");
const GAL_GOLD = new THREE.Color("#ffd56a");
const GAL_PINK = new THREE.Color("#ff4f8a");
const GAL_CYAN = new THREE.Color("#7ad4ff");
const GAL_PURPLE = new THREE.Color("#a78bfa");
const GAL_WHITE = new THREE.Color("#f6f8ff");

const STAGES = [
  { at: 0, key: "scatter" },
  { at: .04, key: "scatter" },
  { at: .054, key: "vortex" },
  { at: .094, key: "vortex" },
  { at: .108, key: "globe" },
  { at: .148, key: "globe" },
  { at: .176, key: "earth" },
  { at: .19, key: "earth" },
  { at: .204, key: "leaf" },
  { at: .38, key: "leaf" },
  { at: .41, key: "human" },
  { at: .50, key: "human" },
  { at: .53, key: "swirl" },
  { at: .60, key: "swirl" },
  { at: .615, key: "sphere" },
  { at: .638, key: "sphere" },
  { at: .645, key: "dot" },
  { at: .72, key: "dot" },
  { at: .758, key: "ring" },
  { at: .86, key: "ring" },
  { at: .908, key: "ring" },
  { at: .93, key: "ring" },
  { at: .952, key: "dot" },
  { at: .968, key: "burst" },
  { at: .985, key: "finale" },
  { at: 1, key: "finale" }
] as const;

export type CloudFrame = {
  video: number;
  videoOpacity: number;
  videoLift: number;
  videoExit: number;
  ringY: number;
  ringR: number;
  ringAmt: number;
  ringFat: number;
  logo: number;
};

const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820;
const COUNT = 14000;
const GLOBE_FAR: [number, number, number, number, number, number] = [0, 0, 6.5, 0, 0, 0];
const GLOBE_NEAR: [number, number, number, number, number, number] = [0, 0, 4.8, 0, 0, 0];

export class BrandCloud {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 9 / 16, .05, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly spin = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly live: Float32Array;
  private readonly color: Float32Array;
  private readonly targets: Record<string, Float32Array>;
  private readonly colors: Record<string, Float32Array>;
  private readonly sprite: THREE.CanvasTexture;
  private readonly disc: THREE.CanvasTexture;
  private explode = 0;
  private journey = 0;
  private still = true;
  private yaw = 0;
  private yawTarget = 0;
  private breathMix = 1;
  private cam = new THREE.Vector3(0, 0, 15.2);
  private look = new THREE.Vector3();
  private viewW = 0;
  private viewH = 0;
  private prevJourney = 0;
  private readonly tilt = new THREE.Vector2();
  private readonly tiltGoal = new THREE.Vector2();

  static async create(canvas: HTMLCanvasElement): Promise<BrandCloud> {
    const [logo, human] = await Promise.all([sampleLogo(COUNT), loadHumanCloud(COUNT)]);
    return new BrandCloud(canvas, logo, human);
  }

  private constructor(
    canvas: HTMLCanvasElement,
    logo: { pos: Float32Array; color: Float32Array },
    human: { pos: Float32Array; color: Float32Array }
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
      precision: mobile ? "mediump" : "highp"
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));

    this.sprite = sparkSprite();
    this.disc = discSprite();
    const cell = sampleSwirl(COUNT);
    const globe = sampleGlobe(COUNT);
    const vortex = sampleVortex(COUNT);
    this.targets = {
      logo: logo.pos,
      scatter: sampleScatter(COUNT),
      vortex: vortex.pos,
      globe: globe.pos,
      earth: globe.limb,
      leaf: sampleLeaf(COUNT),
      human: human.pos,
      swirl: cell.pos,
      sphere: sampleSphere(COUNT, 1),
      dot: sampleDot(COUNT),
      ring: sampleRing(COUNT),
      fall: sampleDot(COUNT),
      burst: sampleScatter(COUNT),
      finale: sampleSphere(COUNT, 1)
    };
    this.colors = {
      logo: logo.color,
      scatter: starColors(COUNT),
      vortex: vortex.color,
      globe: globe.color,
      earth: globe.limbColor,
      leaf: duo(COUNT, (i) => hash(i, 4) > .55),
      human: human.color,
      swirl: cell.color,
      sphere: sphereColors(this.targets.sphere),
      dot: solid(COUNT, ORANGE),
      ring: colorRing(this.targets.ring),
      fall: solid(COUNT, ORANGE),
      burst: duo(COUNT, (i) => hash(i, 7) > .45),
      finale: sphereColors(this.targets.finale)
    };

    this.live = this.targets.logo.slice();
    this.color = this.colors.logo.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.live, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.color, 3));
    const mat = new THREE.PointsMaterial({
      size: .04,
      map: this.sprite,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.spin);
    this.spin.add(this.points);
    this.points.visible = true;
    this.camera.position.copy(this.cam);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    window.visualViewport?.addEventListener("resize", this.resize);
    window.visualViewport?.addEventListener("scroll", this.resize);
    this.renderer.setAnimationLoop(this.tick);
  }

  setExplode(t: number): void {
    this.explode = clamp(t);
    this.points.visible = true;
  }

  setJourney(t: number): void {
    this.journey = clamp(t);
  }

  setStill(still: boolean): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.still = false;
      this.breathMix = 0;
      return;
    }
    this.still = still;
  }

  addYaw(delta: number): void {
    this.yawTarget += delta;
  }

  setTilt(x: number, y: number): void {
    this.tiltGoal.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }

  frame(): CloudFrame {
    const p = this.journey;
    const crown = .11;
    const rest = .5;
    const feetAt = .86;
    const slideEnd = .908;
    const fatEnd = .93;
    const gatherEnd = .952;
    const lift = p < .668 ? 0 : p < .742 ? invLerp(.668, .742, p) : 1;
    const video = p < .742 ? 0 : p < feetAt ? invLerp(.742, feetAt, p) : 1;
    const haloTop = .176;
    const haloBot = .785;
    const followExit = ((haloBot - rest) * 100) / 110;
    let exit = 0;
    if (p >= feetAt && p < slideEnd) exit = invLerp(feetAt, slideEnd, p) * followExit;
    else if (p >= slideEnd && p < .968) exit = followExit + (1 - followExit) * invLerp(slideEnd, .968, p);
    else if (p >= .968) exit = 1;
    const videoOpacity = p < .668 ? 0 : p < .682 ? invLerp(.668, .682, p) : p < feetAt ? 1 : p < slideEnd ? 1 - invLerp(feetAt, slideEnd, p) * .85 : p < .968 ? .15 * (1 - invLerp(slideEnd, .968, p)) : 0;
    let ringAmt = 0;
    if (p >= .72 && p < .758) ringAmt = smooth(invLerp(.72, .758, p));
    else if (p >= .758 && p < fatEnd) ringAmt = 1;
    else if (p >= fatEnd && p < gatherEnd) ringAmt = 1 - smooth(invLerp(fatEnd, gatherEnd, p));
    let ringFat = 0;
    if (p >= slideEnd && p < fatEnd) ringFat = smooth(invLerp(slideEnd, fatEnd, p));
    else if (p >= fatEnd && p < gatherEnd) ringFat = 1;
    const videoTop = 1 - lift;
    const ride = Math.min(rest, Math.max(crown, videoTop - .02));
    let trackScreen = ride;
    if (p >= .742 && p < feetAt) trackScreen = THREE.MathUtils.lerp(haloTop, haloBot, video);
    else if (p >= feetAt && p < slideEnd) trackScreen = THREE.MathUtils.lerp(haloBot, rest, smooth(invLerp(feetAt, slideEnd, p)));
    else if (p >= slideEnd && p < .968) trackScreen = rest;
    const z = Math.abs(this.cam.z - this.look.z) || 12.2;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * .5)) * z;
    const halfW = halfH * this.camera.aspect;
    const logo = this.explode < 1 ? 1 - this.explode : invLerp(.96, 1, p);
    return {
      video,
      videoOpacity,
      videoLift: lift,
      videoExit: exit,
      ringY: (.5 - trackScreen) * 2 * halfH,
      ringR: halfW * .535,
      ringAmt,
      ringFat,
      logo
    };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    window.visualViewport?.removeEventListener("resize", this.resize);
    window.visualViewport?.removeEventListener("scroll", this.resize);
    this.sprite.dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  readonly resize = (): void => {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(rect.width || vv?.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || vv?.height || window.innerHeight));
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
  };

  private readonly tick = (): void => {
    const canvas = this.renderer.domElement;
    if (Math.abs(canvas.clientWidth - this.viewW) > 1 || Math.abs(canvas.clientHeight - this.viewH) > 1) {
      this.resize();
    }
    this.morph();
    this.tilt.lerp(this.tiltGoal, .1);
    const freeze = this.journey >= .638 && this.journey < .952;
    const idleLogo = this.explode < .08 && this.journey < .001;
    if (freeze || idleLogo) {
      this.camera.position.lerp(this.cam, idleLogo ? .2 : .14);
      this.camera.lookAt(this.look);
    } else {
      this.camera.position.lerp(this.cam, this.journey >= .08 && this.journey < .22 ? .1 : .06);
      const span = Math.abs(this.cam.z - this.look.z) || 10;
      const lean = span * .038;
      this.camera.position.x += this.tilt.x * lean;
      this.camera.position.y += this.tilt.y * lean * .82;
      this.camera.lookAt(
        this.look.x + this.tilt.x * span * .014,
        this.look.y + this.tilt.y * span * .012,
        this.look.z
      );
    }
    this.renderer.render(this.scene, this.camera);
  };

  private morph(): void {
    const exp = smooth(this.explode);
    let fromKey = "scatter";
    let toKey = "earth";
    let local = 0;

    if (exp < 1) {
      fromKey = "logo";
      toKey = "scatter";
      local = exp;
    } else {
      const p = this.journey;
      for (let i = 0; i < STAGES.length - 1; i++) {
        if (p <= STAGES[i + 1].at) {
          fromKey = STAGES[i].key;
          toKey = STAGES[i + 1].key;
          local = invLerp(STAGES[i].at, STAGES[i + 1].at, p);
          break;
        }
      }
    }

    const from = this.targets[fromKey];
    const to = this.targets[toKey];
    const cf = this.colors[fromKey];
    const ct = this.colors[toKey];
    const ease = smooth(local);
    const burst = Math.sin(local * Math.PI);
    const live = this.live;
    const color = this.color;
    const frame = this.frame();
    this.aimCamera(fromKey, toKey, ease, local);
    const sphereFit = this.sphereFit();
    const logoFit = this.logoFit();
    const idle = fromKey === "logo" && local < .02 && this.journey < .001;
    const pulse = 1 + Math.sin(performance.now() * .00108) * (idle ? .035 : fromKey === "logo" ? .035 * (1 - local) : 0);
    const fromS = fromKey === "sphere" || fromKey === "finale" ? sphereFit : fromKey === "logo" ? logoFit * pulse : 1;
    const toS = toKey === "sphere" || toKey === "finale" ? sphereFit : toKey === "logo" ? logoFit : 1;

    let drop = 0;
    if (fromKey === "ring" && toKey === "fall") {
      drop = THREE.MathUtils.lerp(0, -2.2, ease);
    } else if (fromKey === "fall" && toKey === "burst") {
      drop = THREE.MathUtils.lerp(-2.2, 0, ease);
    }

    const scanCloud = exp >= 1 && this.journey >= .645 && this.journey < .952;
    const globePos = this.targets.globe;
    const crescent = this.targets.earth;
    const gc = this.colors.globe;
    const cc = this.colors.earth;
    let gatherT = -1;
    if (fromKey === "globe" && toKey === "globe") gatherT = local < .28 ? 0 : invLerp(.28, 1, local);
    else if (fromKey === "globe" && toKey === "earth") gatherT = 1;
    else if (fromKey === "earth" && toKey === "earth") gatherT = 1;
    if (!scanCloud) {
      for (let i = 0; i < live.length; i += 3) {
        if (gatherT > 0) {
          gatherAlongOuterRing(live, i, globePos[i], globePos[i + 1], globePos[i + 2], crescent[i], crescent[i + 1], crescent[i + 2], gatherT);
          color[i] = gc[i] + (cc[i] - gc[i]) * gatherT;
          color[i + 1] = gc[i + 1] + (cc[i + 1] - gc[i + 1]) * gatherT;
          color[i + 2] = gc[i + 2] + (cc[i + 2] - gc[i + 2]) * gatherT;
          continue;
        }
        const nx = from[i] * fromS + (to[i] * toS - from[i] * fromS) * ease;
        const ny = from[i + 1] * fromS + (to[i + 1] * toS - from[i + 1] * fromS) * ease;
        const nz = from[i + 2] * fromS + (to[i + 2] * toS - from[i + 2] * fromS) * ease;
        const kick = fromKey === toKey || fromKey === "ring" || toKey === "ring" || toKey === "human" || fromKey === "globe" || toKey === "globe" || fromKey === "vortex" || toKey === "vortex" || fromKey === "dot" || toKey === "dot" || fromKey === "burst" || toKey === "burst" || fromKey === "finale" || toKey === "finale" || fromKey === "sphere" || toKey === "sphere" ? 0 : burst * .16;
        live[i] = nx * (1 + kick);
        live[i + 1] = ny + drop;
        live[i + 2] = nz * (1 + kick * .6);
        color[i] = cf[i] + (ct[i] - cf[i]) * ease;
        color[i + 1] = cf[i + 1] + (ct[i + 1] - cf[i + 1]) * ease;
        color[i + 2] = cf[i + 2] + (ct[i + 2] - cf[i + 2]) * ease;
      }
    }

    this.keepStarfield(fromKey, toKey, ease, local);

    this.breathMix += (1 - this.breathMix) * .12;
    const lockScan = fromKey === "dot" || toKey === "dot" || fromKey === "ring" || toKey === "ring";
    const onLogo = fromKey === "logo" || toKey === "logo";
    const onHuman = fromKey === "human" || toKey === "human";
    if (this.breathMix > .02 && !lockScan && !(fromKey === toKey && fromKey === "fall")) {
      const now = performance.now() * .001;
      const planar = onLogo || fromKey === "dot" || toKey === "dot" || fromKey === "fall";
      const onGlobeHold = fromKey === "globe" || toKey === "globe" || fromKey === "earth" || toKey === "earth";
      const amp = ((onLogo && this.explode < .08 ? .016 : onHuman && fromKey === toKey ? .01 : onGlobeHold ? .005 : planar ? .01 : .038) * this.breathMix);
      for (let i = 0, p = 0; i < live.length; i += 3, p++) {
        const ph = hash(p, 90) * Math.PI * 2;
        const fx = .55 + hash(p, 91) * .55;
        const fy = .45 + hash(p, 92) * .5;
        const fz = .4 + hash(p, 93) * .45;
        live[i] += Math.sin(now * fx + ph) * amp;
        live[i + 1] += Math.sin(now * fy + ph * 1.37) * amp * .75;
        live[i + 2] += Math.cos(now * fz + ph * .81) * amp * (onLogo ? 1.8 : .55);
      }
    }

    if (exp >= 1 && this.journey >= .645 && this.journey < .952) {
      const ring = this.targets.ring;
      const cluster = this.targets.dot;
      const rc = this.colors.ring;
      const r = frame.ringR;
      const amt = frame.ringAmt;
      const fat = frame.ringFat;
      const y0 = frame.ringY;
      for (let i = 0; i < live.length; i += 3) {
        const n = i / 3;
        const ux = ring[i];
        const uy = ring[i + 1];
        const uz = ring[i + 2];
        const br = Math.hypot(ux, uz) || 1;
        const spread = 1 + (br - 1) * (1 + fat * 2.6) + fat * (hash(n, 64) - .5) * .1;
        const nx = (ux / br) * spread * r;
        const ny = uy * (1 + fat * 2.8);
        const nz = (uz / br) * spread * r;
        live[i] = cluster[i] + (nx - cluster[i]) * amt;
        live[i + 1] = y0 + cluster[i + 1] + (ny - cluster[i + 1]) * amt;
        live[i + 2] = cluster[i + 2] + (nz - cluster[i + 2]) * amt;
        color[i] = ORANGE.r + (rc[i] - ORANGE.r) * amt;
        color[i + 1] = ORANGE.g + (rc[i + 1] - ORANGE.g) * amt;
        color[i + 2] = ORANGE.b + (rc[i + 2] - ORANGE.b) * amt;
      }
    } else if (exp >= 1 && this.journey >= .952 && this.journey < .968) {
      const burstPos = this.targets.burst;
      const burstCol = this.colors.burst;
      const cluster = this.targets.dot;
      const t = smooth(invLerp(.952, .968, this.journey));
      const y0 = frame.ringY;
      const punch = Math.sin(t * Math.PI) * .18;
      for (let i = 0; i < live.length; i += 3) {
        live[i] = cluster[i] + (burstPos[i] - cluster[i]) * t * (1 + punch);
        live[i + 1] = y0 + cluster[i + 1] + (burstPos[i + 1] - y0 - cluster[i + 1]) * t;
        live[i + 2] = cluster[i + 2] + (burstPos[i + 2] - cluster[i + 2]) * t * (1 + punch * .6);
        color[i] = ORANGE.r + (burstCol[i] - ORANGE.r) * t;
        color[i + 1] = ORANGE.g + (burstCol[i + 1] - ORANGE.g) * t;
        color[i + 2] = ORANGE.b + (burstCol[i + 2] - ORANGE.b) * t;
      }
    } else if (fromKey === "ring" || toKey === "ring") {
      const ring = this.targets.ring;
      const amt = fromKey === "ring" && toKey === "ring"
        ? 1
        : fromKey === "ring" ? 1 - ease : (toKey === "ring" ? ease : 0);
      if (amt > .04) {
        const grow = fromKey === "dot" && toKey === "ring" ? ease : 1;
        const r = frame.ringR * Math.max(.12, grow);
        for (let i = 0; i < live.length; i += 3) {
          live[i] += (ring[i] * r - live[i]) * amt;
          live[i + 1] += (ring[i + 1] + frame.ringY - live[i + 1]) * amt;
          live[i + 2] += (ring[i + 2] * r - live[i + 2]) * amt;
        }
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    const mat = this.points.material as THREE.PointsMaterial;
    const onSphere = fromKey === "sphere" || toKey === "sphere" || fromKey === "finale" || toKey === "finale";
    const onRing = fromKey === "ring" || toKey === "ring";
    const onEarth = fromKey === "earth" || toKey === "earth";
    const onGlobe = fromKey === "globe" || toKey === "globe";
    const onVortex = fromKey === "vortex" || toKey === "vortex";
    const onSwirl = fromKey === "swirl" || toKey === "swirl";
    const fineArc = gatherT > .18 || (onEarth && !onGlobe);
    const onOrange = fromKey === "dot" || toKey === "dot" || fromKey === "ring" || toKey === "ring";
    const nextMap = this.sprite;
    if (mat.map !== nextMap) {
      mat.map = nextMap;
      mat.needsUpdate = true;
    }
    const nextBlend = fromKey === "logo" && this.explode < .4
      ? THREE.NormalBlending
      : THREE.AdditiveBlending;
    if (mat.blending !== nextBlend) {
      mat.blending = nextBlend;
      mat.needsUpdate = true;
    }
    mat.alphaTest = fromKey === "logo" && this.explode < .4 ? 0 : onRing || onOrange ? 0 : fineArc ? .04 : .12;
    if (!mat.sizeAttenuation) {
      mat.sizeAttenuation = true;
      mat.needsUpdate = true;
    }
    mat.size = gatherT >= 0
      ? THREE.MathUtils.lerp(pointSizeOf("globe"), pointSizeOf("earth"), gatherT)
      : pointSizeOf(fromKey) + (pointSizeOf(toKey) - pointSizeOf(fromKey)) * ease;
    mat.opacity = fromKey === "logo"
      ? .18 + this.explode * .54
      : onOrange ? .92 : fromKey === "scatter" || toKey === "scatter" ? .94 : onVortex ? .88 : fineArc ? .86 : onGlobe ? .9 : onEarth || onHuman ? .82 : onSwirl ? .58 : .72;
    this.points.geometry.setDrawRange(0, COUNT);
    const dj = this.journey - this.prevJourney;
    this.prevJourney = this.journey;
    const lockYaw = lockScan || (fromKey === "logo" && this.explode < .08);
    if (lockYaw) {
      this.yaw += (0 - this.yaw) * .14;
      this.yawTarget *= .88;
    } else {
      const globeLike = onGlobe || onEarth;
      const swipe = dj * (onVortex ? 2.4 : globeLike ? .7 : onSwirl || onHuman ? 1.15 : 1.9);
      const drift = onVortex ? .0014 : globeLike ? .0001 : onSphere ? .0008 : .00032;
      this.yawTarget += swipe + drift;
      this.yaw += (this.yawTarget - this.yaw) * (globeLike ? .055 : .09);
      this.yawTarget *= .975;
      if (globeLike) {
        this.yaw = THREE.MathUtils.clamp(this.yaw, -.16, .16);
        this.yawTarget = THREE.MathUtils.clamp(this.yawTarget, -.18, .18);
      }
    }
    this.spin.rotation.y = this.yaw;
  }

  private keepStarfield(fromKey: string, toKey: string, ease: number, local: number): void {
    const sky = fromKey === "globe" || toKey === "globe" || fromKey === "earth" || toKey === "earth";
    if (!sky) return;
    const scatter = this.targets.scatter;
    const sc = this.colors.scatter;
    const leaf = this.targets.leaf;
    const lc = this.colors.leaf;
    let zoom = 0;
    if (fromKey === "globe" && toKey === "globe") zoom = local;
    else if (fromKey === "globe" && toKey === "earth") zoom = 1;
    else if (fromKey === "earth" && toKey === "earth") zoom = 1;
    else if (fromKey === "earth") zoom = 1 - ease;
    else if (fromKey === "globe") zoom = 1;
    const leaving = fromKey === "earth" && toKey === "leaf";
    if (zoom > .42 && !leaving) return;
    const recede = THREE.MathUtils.lerp(1, 1.15, zoom);
    const dim = 1 - zoom * .12;
    const live = this.live;
    const color = this.color;
    const globe = this.targets.globe;
    for (let i = 0, n = 0; i < live.length; i += 3, n++) {
      if (Math.hypot(globe[i], globe[i + 1]) > .4) continue;
      if (hash(n, 41) < .8) continue;
      const rx = scatter[i];
      const ry = scatter[i + 1];
      const rz = scatter[i + 2];
      const rr = Math.hypot(rx, ry, rz) || 1;
      let sx = rx * recede;
      const sy = ry * recede;
      const sz = rz * recede;
      if (Math.abs(rx) / rr < .1) {
        sx = (hash(n, 44) < .5 ? -1 : 1) * (.12 + hash(n, 45) * .4) * rr * recede;
      }
      if (leaving) {
        live[i] = sx + (leaf[i] - sx) * ease;
        live[i + 1] = sy + (leaf[i + 1] - sy) * ease;
        live[i + 2] = sz + (leaf[i + 2] - sz) * ease;
        color[i] = sc[i] * dim + (lc[i] - sc[i] * dim) * ease;
        color[i + 1] = sc[i + 1] * dim + (lc[i + 1] - sc[i + 1] * dim) * ease;
        color[i + 2] = sc[i + 2] * dim + (lc[i + 2] - sc[i + 2] * dim) * ease;
      } else {
        live[i] = sx;
        live[i + 1] = sy;
        live[i + 2] = sz;
        const starW = (.16 + hash(n, 46) * .62) * dim;
        color[i] = starW;
        color[i + 1] = starW;
        color[i + 2] = starW * .96;
      }
    }
  }

  private sphereFit(): number {
    const z = Math.abs(this.cam.z - this.look.z) || 9.4;
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * .5)) * z * this.camera.aspect;
    return halfW * .7;
  }

  private northArc(): [number, number, number, number, number, number] {
    const aspect = Math.max(.28, this.camera.aspect);
    const chord = 1.12;
    const sag = 1 - Math.sqrt(Math.max(0, 1 - (chord * .5) ** 2));
    const fill = .9;
    const halfW = (chord * .5) / fill;
    const z = halfW / aspect / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * .5));
    const lookY = 1 - sag * .42;
    return [0, lookY, z, 0, lookY, 0];
  }

  private logoFit(): number {
    const z = Math.abs(this.cam.z - this.look.z) || 15.2;
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * .5)) * z * this.camera.aspect;
    return (halfW * 1.58) / 11.6;
  }

  private aimCamera(from: string, to: string, t: number, local = t): void {
    let a = cameraOf(from);
    let b = cameraOf(to);
    const near = this.northArc();
    const mix = (fromPose: [number, number, number, number, number, number], toPose: [number, number, number, number, number, number], k: number): void => {
      this.cam.set(
        fromPose[0] + (toPose[0] - fromPose[0]) * k,
        fromPose[1] + (toPose[1] - fromPose[1]) * k,
        fromPose[2] + (toPose[2] - fromPose[2]) * k
      );
      this.look.set(
        fromPose[3] + (toPose[3] - fromPose[3]) * k,
        fromPose[4] + (toPose[4] - fromPose[4]) * k,
        fromPose[5] + (toPose[5] - fromPose[5]) * k
      );
    };
    if (from === "globe" && to === "globe") {
      mix(GLOBE_FAR, near, local < .38 ? 0 : invLerp(.38, 1, local));
      return;
    }
    if (from === "earth" && to === "earth") {
      mix(near, near, 1);
      return;
    }
    if (from === "globe" && to === "earth") {
      mix(near, near, 1);
      return;
    }
    if (to === "globe") {
      b = GLOBE_FAR;
    } else if (from === "earth") {
      a = near;
    }
    this.cam.set(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    );
    this.look.set(
      a[3] + (b[3] - a[3]) * t,
      a[4] + (b[4] - a[4]) * t,
      a[5] + (b[5] - a[5]) * t
    );
  }
}

function pointSizeOf(key: string): number {
  switch (key) {
    case "earth":
      return .02;
    case "sphere":
    case "finale":
      return .032;
    case "scatter":
    case "burst":
      return .058;
    default:
      return .04;
  }
}

function cameraOf(key: string): [number, number, number, number, number, number] {
  switch (key) {
    case "logo":
      return [0, 0, 15.2, 0, 0, 0];
    case "scatter":
      return [0, .4, 18, 0, 0, 0];
    case "vortex":
      return [0, 1.85, 9.4, 0, .08, 0];
    case "globe":
      return GLOBE_FAR;
    case "earth":
      return GLOBE_NEAR;
    case "leaf":
      return [0, 1.4, 11, 0, .4, 0];
    case "human":
      return [0, .2, 10.2, 0, .18, 0];
    case "swirl":
      return [0, 3.2, 5.15, 0, .78, -.9];
    case "sphere":
      return [0, 0, 9.4, 0, 0, 0];
    case "dot":
      return [0, 1.05, 12.2, 0, 0, 0];
    case "ring":
      return [0, 1.05, 12.2, 0, 0, 0];
    case "fall":
      return [0, -1.2, 11, 0, -1.4, 0];
    case "burst":
      return [0, .15, 12.4, 0, 0, 0];
    case "finale":
      return [0, 0, 9.4, 0, 0, 0];
    default:
      return [0, .2, 16, 0, 0, 0];
  }
}

async function sampleLogo(count: number): Promise<{ pos: Float32Array; color: Float32Array }> {
  const svg = await fetch("./logo.svg").then((r) => r.text());
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  const w = 2048;
  const h = 300;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { pos: sampleSphere(count, 2), color: duo(count, (i) => hash(i, 8) > .8) };
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 48, 28, 1952, 244);
  const data = ctx.getImageData(0, 0, w, h).data;
  const hits: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 120) hits.push(x, y, data[i], data[i + 1]);
    }
  }
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const span = Math.max(1, hits.length / 4);
  for (let i = 0; i < count; i++) {
    const pick = Math.floor((i * 17 + hash(i, 1) * 3) % span) * 4;
    const x = hits[pick] / w;
    const y = hits[pick + 1] / h;
    const r = hits[pick + 2];
    const g = hits[pick + 3];
    pos[i * 3] = (x - .5) * 11.6 + (hash(i, 5) - .5) * .06;
    pos[i * 3 + 1] = (.5 - y) * 1.72 + (hash(i, 6) - .5) * .03;
    pos[i * 3 + 2] = (hash(i, 2) - .5) * 2.8;
    write(color, i * 3, r > 200 && g < 140 ? ORANGE : new THREE.Color("#eef4ff"));
  }
  return { pos, color };
}

async function loadHumanCloud(count: number): Promise<{ pos: Float32Array; color: Float32Array }> {
  try {
    const src = new Float32Array(await fetch("./female-skin.bin").then((r) => {
      if (!r.ok) throw new Error("female-skin");
      return r.arrayBuffer();
    }));
    return skinCloud(src, count, 1.55);
  } catch {
    return skinCloud(sampleHuman(count), count, 1.55);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sampleVortex(count: number): { pos: Float32Array; color: Float32Array } {
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const tint = new THREE.Color();
  const tilt = .86;
  const yaw = .52;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const orient = (lx: number, ly: number, lz: number): [number, number, number] => {
    const y1 = ly * ct - lz * st;
    const z1 = ly * st + lz * ct;
    return [lx * cy + z1 * sy, y1, -lx * sy + z1 * cy];
  };
  for (let i = 0; i < count; i++) {
    const role = hash(i, 301);
    let lx = 0;
    let ly = 0;
    let lz = 0;
    if (role < .14) {
      const r = 2.6 + Math.pow(hash(i, 302), .52) * 9.5;
      const p = sampleOnSphere(r, i, 303);
      lx = p[0];
      ly = p[1] * .68;
      lz = p[2];
      const star = hash(i, 304);
      if (star < .52) tint.copy(GAL_WHITE);
      else if (star < .74) tint.copy(GAL_CYAN);
      else if (star < .88) tint.copy(GAL_GOLD);
      else tint.copy(GAL_PURPLE);
      tint.multiplyScalar(.16 + hash(i, 305) * .62);
    } else if (role < .36) {
      const rr = Math.sqrt(-2 * Math.log(Math.max(1e-6, hash(i, 306)))) * .2;
      const a = hash(i, 307) * Math.PI * 2;
      lx = Math.cos(a) * rr * 1.28;
      lz = Math.sin(a) * rr * .58;
      ly = gauss(i, 308, 309) * .07 * (1 - Math.min(1, rr * 2.2));
      tint.copy(GAL_CORE).lerp(GAL_GOLD, hash(i, 310) * .72);
      if (hash(i, 311) > .82) tint.lerp(ORANGE, .35);
      tint.multiplyScalar(.78 + hash(i, 312) * .32);
    } else if (role < .46) {
      const t = (hash(i, 313) - .5) * 1.05;
      lx = t;
      lz = (hash(i, 314) - .5) * .11 * (1 - Math.abs(t));
      ly = (hash(i, 315) - .5) * .05;
      tint.copy(GAL_GOLD).lerp(ORANGE, hash(i, 316) * .55);
      tint.multiplyScalar(.7 + hash(i, 317) * .3);
    } else {
      const u = hash(i, 318);
      const r = .16 + Math.pow(u, .68) * 2.22;
      const arm = hash(i, 319) < .5 ? 0 : 1;
      const onArm = hash(i, 320) > .22;
      const wind = -Math.log((r + .08) / .16) / .46 + arm * Math.PI;
      const spread = (hash(i, 321) - .5) * (onArm ? .09 + r * .12 : Math.PI);
      const theta = onArm ? wind + spread : hash(i, 322) * Math.PI * 2;
      const rad = onArm ? r : r * (.42 + hash(i, 323) * .58);
      lx = Math.cos(theta) * rad;
      lz = Math.sin(theta) * rad;
      ly = gauss(i, 324, 325) * (.02 + rad * .028);
      if (!onArm) {
        tint.copy(ORANGE).lerp(GAL_GOLD, hash(i, 326) * .45);
        tint.multiplyScalar(.18 + hash(i, 327) * .22);
      } else if (r < .5) {
        tint.copy(GAL_GOLD).lerp(ORANGE, hash(i, 328) * .65);
        tint.multiplyScalar(.62 + hash(i, 329) * .3);
      } else {
        const mix = hash(i, 330);
        if (mix < .34) tint.copy(BLUE).lerp(GAL_CYAN, hash(i, 331));
        else if (mix < .52) tint.copy(GAL_PINK).lerp(ORANGE, hash(i, 332) * .7);
        else if (mix < .7) tint.copy(ORANGE).lerp(GAL_GOLD, hash(i, 333) * .4);
        else if (mix < .86) tint.copy(GAL_PURPLE).lerp(BLUE_HOT, hash(i, 334));
        else tint.copy(GAL_CYAN).lerp(GAL_WHITE, hash(i, 335) * .5);
        tint.lerp(GAL_CYAN, clamp((r - 1.05) * .45));
        tint.multiplyScalar(.48 + hash(i, 336) * .42);
      }
    }
    const p = role < .14 ? [lx, ly, lz] : orient(lx, ly, lz);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
    write(color, i * 3, tint);
  }
  return { pos, color };
}

function gauss(i: number, s1: number, s2: number): number {
  const u = Math.max(1e-6, hash(i, s1));
  const v = hash(i, s2) * Math.PI * 2;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(v);
}

function sampleScatter(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 2 + Math.pow(hash(i, 11), .55) * 11;
    const p = sampleOnSphere(r, i, 12);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1] * .72;
    out[i * 3 + 2] = p[2];
  }
  return out;
}

function placeGlobePoint(
  pos: Float32Array,
  limb: Float32Array,
  color: Float32Array,
  limbColor: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number
): void {
  const o = index * 3;
  pos[o] = x;
  pos[o + 1] = y;
  pos[o + 2] = z;
  const arc = toUpperLimb(x, y, z, index);
  limb[o] = arc[0];
  limb[o + 1] = arc[1];
  limb[o + 2] = arc[2];
  write(color, o, globeTint(x, y, z, index));
  write(limbColor, o, crescentTint(arc[0], arc[1], index));
}

function sampleGlobe(count: number): { pos: Float32Array; limb: Float32Array; color: Float32Array; limbColor: Float32Array } {
  const pos = new Float32Array(count * 3);
  const limb = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const limbColor = new Float32Array(count * 3);
  let placed = 0;
  const rimN = Math.floor(count * .34);
  for (let i = 0; i < rimN; i++) {
    const a = (i / rimN) * Math.PI * 2;
    const x = Math.cos(a);
    const y = Math.sin(a);
    const z = (hash(i, 202) - .5) * .045;
    const len = Math.hypot(x, y, z) || 1;
    placeGlobePoint(pos, limb, color, limbColor, placed, x / len, y / len, z / len);
    placed += 1;
  }
  let guard = 0;
  while (placed < count && guard < count * 260) {
    guard += 1;
    const p = sampleOnSphere(1, guard, 210);
    const x = p[0];
    const y = p[1];
    const z = p[2];
    const rim = Math.hypot(x, y);
    const graze = 1 - Math.abs(z);
    let keep = .22 + Math.pow(graze, 1.6) * .7 + Math.pow(rim, 2) * .18;
    if (z < -.28) keep *= .08;
    if (hash(guard, 212) > keep) continue;
    const fuzz = 1 + (hash(guard, 213) - .5) * .01;
    placeGlobePoint(pos, limb, color, limbColor, placed, x * fuzz, y * fuzz, z * fuzz);
    placed += 1;
  }
  const filled = Math.max(1, placed);
  while (placed < count) {
    const j = (placed % filled) * 3;
    const o = placed * 3;
    pos[o] = pos[j];
    pos[o + 1] = pos[j + 1];
    pos[o + 2] = pos[j + 2];
    limb[o] = limb[j];
    limb[o + 1] = limb[j + 1];
    limb[o + 2] = limb[j + 2];
    color[o] = color[j];
    color[o + 1] = color[j + 1];
    color[o + 2] = color[j + 2];
    limbColor[o] = limbColor[j];
    limbColor[o + 1] = limbColor[j + 1];
    limbColor[o + 2] = limbColor[j + 2];
    placed += 1;
  }
  return { pos, limb, color, limbColor };
}

function toUpperLimb(_x: number, _y: number, _z: number, i: number): [number, number, number] {
  const u = (i * .7548776662) % 1;
  const centered = (u - .5) * 2;
  const t = Math.sign(centered) * Math.pow(Math.abs(centered), 1.32);
  const theta = t * Math.PI * .47;
  const mid = Math.pow(1 - Math.abs(t), 1.55);
  const n = gauss(i, 24, 25);
  const fall = THREE.MathUtils.clamp(Math.sign(n || 1) * Math.pow(Math.min(1.4, Math.abs(n) * .48), 1.45), -1, 1);
  const band = .008 + mid * .062;
  const radial = 1 + fall * band;
  return [
    Math.sin(theta) * radial,
    Math.cos(theta) * radial,
    gauss(i, 26, 28) * (.002 + mid * .008)
  ];
}

function crescentTint(x: number, _y: number, i: number): THREE.Color {
  const side = THREE.MathUtils.clamp((x + .95) / 1.9, 0, 1);
  const tint = new THREE.Color();
  if (side < .58) {
    tint.copy(BLUE).lerp(GAL_CYAN, .4 + hash(i, 88) * .28);
  } else if (side < .76) {
    tint.copy(GAL_CYAN).lerp(ORANGE, (side - .58) / .18 * .55);
  } else {
    tint.copy(ORANGE).lerp(GAL_GOLD, hash(i, 89) * .22);
  }
  tint.multiplyScalar(.48 + hash(i, 90) * .22);
  return tint;
}

function gatherAlongOuterRing(
  out: Float32Array,
  i: number,
  gx: number,
  gy: number,
  gz: number,
  tx: number,
  ty: number,
  tz: number,
  t: number
): void {
  const fromA = Math.atan2(gx, gy);
  const toA = Math.atan2(tx, ty);
  let da = toA - fromA;
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  if (Math.abs(Math.abs(da) - Math.PI) < .04) da = gx >= 0 ? Math.PI : -Math.PI;
  const toRim = smooth(Math.min(1, t / .42));
  const along = smooth(Math.max(0, (t - .28) / .72));
  const a = fromA + da * along;
  const startR = Math.hypot(gx, gy) || .001;
  const endR = Math.hypot(tx, ty) || 1;
  const r = startR + (1 - startR) * toRim;
  const r2 = r + (endR - r) * along;
  out[i] = Math.sin(a) * r2;
  out[i + 1] = Math.cos(a) * r2;
  out[i + 2] = gz * (1 - toRim) * .25 + tz * along;
}

function globeTint(x: number, y: number, z: number, i: number): THREE.Color {
  const rim = Math.hypot(x, y);
  const side = THREE.MathUtils.clamp((x + 1) * .5, 0, 1);
  const tint = new THREE.Color();
  if (side < .42) {
    tint.copy(ORANGE).lerp(GAL_GOLD, hash(i, 65) * .38);
  } else if (side < .58) {
    tint.copy(ORANGE).lerp(GAL_CYAN, (side - .42) / .16);
  } else {
    tint.copy(BLUE).lerp(GAL_CYAN, .38 + hash(i, 66) * .32);
  }
  let dim = .1 + hash(i, 67) * .08;
  if (rim > .93) dim = .7 + hash(i, 68) * .16;
  else if (rim > .78) dim = .26 + hash(i, 69) * .12;
  else dim = .08 + hash(i, 70) * .08;
  if (z < 0) dim *= .2;
  tint.multiplyScalar(dim);
  return tint;
}

function slerpInto(
  out: Float32Array,
  i: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  t: number
): void {
  const dot = THREE.MathUtils.clamp(ax * bx + ay * by + az * bz, -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-4) {
    out[i] = ax + (bx - ax) * t;
    out[i + 1] = ay + (by - ay) * t;
    out[i + 2] = az + (bz - az) * t;
    return;
  }
  const so = Math.sin(omega);
  const w0 = Math.sin((1 - t) * omega) / so;
  const w1 = Math.sin(t * omega) / so;
  out[i] = ax * w0 + bx * w1;
  out[i + 1] = ay * w0 + by * w1;
  out[i + 2] = az * w0 + bz * w1;
}

function skinCloud(src: Float32Array, count: number, scale: number): { pos: Float32Array; color: Float32Array } {
  const n = Math.max(1, src.length / 3);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const j = Math.floor(i * n / count) * 3;
    pos[i * 3] = src[j] * scale;
    pos[i * 3 + 1] = src[j + 1] * scale;
    pos[i * 3 + 2] = src[j + 2] * scale;
  }
  return { pos, color: shadeSkin(pos) };
}

function shadeSkin(pos: Float32Array): Float32Array {
  const out = new Float32Array(pos.length);
  const n = pos.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < pos.length; i += 3) {
    cx += pos[i];
    cy += pos[i + 1];
    cz += pos[i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const ldx = .48;
  const ldy = .62;
  const ldz = .62;
  const llen = Math.hypot(ldx, ldy, ldz);
  const lx = ldx / llen;
  const ly = ldy / llen;
  const lz = ldz / llen;
  const vx = .06;
  const vy = .16;
  const vz = 1;
  const vlen = Math.hypot(vx, vy, vz);
  const tint = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = pos[o];
    const y = pos[o + 1];
    const z = pos[o + 2];
    let nx = x - cx;
    let ny = (y - cy) * .2;
    let nz = z - cz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
    const ndotv = Math.max(0, nx * vx / vlen + ny * vy / vlen + nz * vz / vlen);
    const wrap = .16 + ndotl * .76;
    const rim = Math.pow(1 - ndotv, 1.7);
    const warm = ndotl * (.5 + Math.max(0, nx) * .75);
    if (warm > .5 && hash(i, 78) > .36) {
      tint.copy(ORANGE).lerp(ORANGE_HOT, clamp(ndotl));
    } else {
      tint.copy(BLUE).lerp(BLUE_HOT, clamp(wrap * .85 + rim * .4));
    }
    const dim = .1 + wrap * .64 + rim * .34;
    out[o] = tint.r * dim;
    out[o + 1] = tint.g * dim;
    out[o + 2] = tint.b * dim;
  }
  return out;
}

function sampleHuman(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = hash(i, 81);
    const v = hash(i, 82);
    let x = 0;
    let y = 0;
    let z = 0;
    if (u < .22) {
      const p = sampleOnSphere(.62, i, 83);
      x = p[0];
      y = p[1] + 2.15;
      z = p[2] * .82;
    } else if (u < .28) {
      x = (v - .5) * .22;
      y = 1.4 + hash(i, 84) * .28;
      z = (hash(i, 85) - .5) * .16;
    } else if (u < .5) {
      const t = (u - .28) / .22;
      x = (v - .5) * (2.2 + t * .2);
      y = 1.12 - t * .75;
      z = (hash(i, 86) - .5) * .26;
    } else if (u < .8) {
      const t = (u - .5) / .3;
      x = (v - .5) * (1.9 - t * .55);
      y = .35 - t * 1.75;
      z = (hash(i, 87) - .5) * .3;
    } else {
      const side = v < .5 ? -1 : 1;
      const t = hash(i, 88);
      x = side * (1.08 + t * .18);
      y = .95 - t * 1.45;
      z = (hash(i, 89) - .5) * .18;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

function sampleSwirl(count: number): { pos: Float32Array; color: Float32Array } {
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const seeds = swirlSeeds();

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 48) {
    guard += 1;
    const t = Math.pow(hash(guard, 401), .78);
    const z = 2.35 - t * 13.6;
    const spread = 1.35 + t * 5.8;
    const x0 = (hash(guard, 402) * 2 - 1) * spread;
    const near = nearestSeeds(x0, z, seeds);
    const wall = .15 + t * .08;
    const gap = near.d2 - near.d1;
    const junction = near.d3 - near.d1 < wall * 1.55 && gap < wall * 1.15;
    const onWall = gap < wall;
    const dust = !onWall && hash(guard, 403) > .93;
    if (!onWall && !dust) continue;

    const a = seeds[near.i1];
    const other = seeds[near.i2];
    const ax = other.x - a.x;
    const az = other.z - a.z;
    const elen = Math.hypot(ax, az) || 1;
    const px = -az / elen;
    const pz = ax / elen;
    const mx = (a.x + other.x) * .5;
    const mz = (a.z + other.z) * .5;
    const along = (x0 - mx) * px + (z - mz) * pz;
    const strand = ((placed % 8) - 3.5) * (.026 + t * .012);
    const thick = (hash(guard, 404) - .5) * wall * .55;
    const x = onWall
      ? mx + px * along + (ax / elen) * (thick + strand)
      : x0;
    const zz = onWall
      ? mz + pz * along + (az / elen) * (thick + strand) * .22
      : z;
    const y = .95
      + .11 * Math.sin(x * .52 + zz * .38)
      + .05 * Math.cos(x * .9 - zz * .46)
      + (hash(guard, 405) - .5) * (onWall ? .035 : .08);

    const dim = dust ? .12 + (1 - t) * .18 : .42 + (1 - t) * .58;
    let r = BLUE.r * dim;
    let g = BLUE.g * dim;
    let b = BLUE.b * dim;
    if (dust) {
      r *= .7;
      g *= .7;
      b *= .7;
    } else if (junction && hash(guard, 406) > .28) {
      const hot = hash(guard, 407) > .45;
      r = (hot ? ORANGE_HOT.r : ORANGE.r) * Math.min(1, dim + .18);
      g = (hot ? ORANGE_HOT.g : ORANGE.g) * Math.min(1, dim + .18);
      b = (hot ? ORANGE_HOT.b : ORANGE.b) * Math.min(1, dim + .18);
    } else if (hash(guard, 408) > .82) {
      r = BLUE_HOT.r * dim;
      g = BLUE_HOT.g * dim;
      b = BLUE_HOT.b * dim;
    }

    const i = placed * 3;
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = zz;
    color[i] = r;
    color[i + 1] = g;
    color[i + 2] = b;
    placed += 1;
  }

  return { pos, color };
}

function swirlSeeds(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const cols = 7;
  const rows = 9;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const n = out.length;
      out.push({
        x: (col - (cols - 1) / 2) * 2.05 + (row % 2) * 1.02 + (hash(n, 410) - .5) * .72,
        z: 1.85 - row * 1.62 + (hash(n, 411) - .5) * .7
      });
    }
  }
  return out;
}

function nearestSeeds(
  x: number,
  z: number,
  seeds: { x: number; z: number }[]
): { d1: number; d2: number; d3: number; i1: number; i2: number; i3: number } {
  let d1 = 1e9;
  let d2 = 1e9;
  let d3 = 1e9;
  let i1 = 0;
  let i2 = 0;
  let i3 = 0;
  for (let s = 0; s < seeds.length; s++) {
    const dx = x - seeds[s].x;
    const dz = z - seeds[s].z;
    const d = dx * dx + dz * dz;
    if (d < d1) {
      d3 = d2;
      i3 = i2;
      d2 = d1;
      i2 = i1;
      d1 = d;
      i1 = s;
    } else if (d < d2) {
      d3 = d2;
      i3 = i2;
      d2 = d;
      i2 = s;
    } else if (d < d3) {
      d3 = d;
      i3 = s;
    }
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), d3: Math.sqrt(d3), i1, i2, i3 };
}

function sampleLeaf(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const t = hash(i, 31);
    const s = hash(i, 32);
    const length = 3.8 * t;
    const width = Math.sin(t * Math.PI) * 1.35 * s;
    out[i * 3] = side * width + (hash(i, 33) - .5) * .06;
    out[i * 3 + 1] = length - .4;
    out[i * 3 + 2] = Math.sin(t * 3.2) * .18 + (hash(i, 34) - .5) * .1;
    if (i % 9 === 0) {
      out[i * 3] *= .12;
      out[i * 3 + 1] = t * 2.2 - .6;
    }
  }
  return out;
}

function sampleCell(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const roll = i / count;
    if (roll < .22) {
      const p = sampleOnSphere(1.05, i, 41);
      out[i * 3] = p[0];
      out[i * 3 + 1] = p[1];
      out[i * 3 + 2] = p[2];
    } else if (roll < .7) {
      const p = sampleOnSphere(2.55 + hash(i, 42) * .2, i, 43);
      out[i * 3] = p[0];
      out[i * 3 + 1] = p[1];
      out[i * 3 + 2] = p[2];
    } else {
      const u = hash(i, 44) * Math.PI * 2;
      const v = hash(i, 45) * Math.PI * 2;
      const R = 2.15;
      const r = .42;
      out[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
      out[i * 3 + 1] = r * Math.sin(v);
      out[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
    }
  }
  return out;
}

function sampleSphere(count: number, radius: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = hash(i, 51);
    const v = hash(i, 52);
    let y = Math.sign(u * 2 - 1) * Math.pow(Math.abs(u * 2 - 1), .36);
    if (i % 6 === 0) y = Math.sign(y || 1) * (.78 + hash(i, 53) * .22);
    const rxy = Math.sqrt(Math.max(0, 1 - y * y));
    const th = v * Math.PI * 2;
    const shell = hash(i, 54) < .78 ? 1 : .32 + hash(i, 55) * .62;
    const r = radius * shell;
    out[i * 3] = r * rxy * Math.cos(th);
    out[i * 3 + 1] = r * y;
    out[i * 3 + 2] = r * rxy * Math.sin(th);
  }
  return out;
}

function sphereColors(pos: Float32Array): Float32Array {
  const color = new Float32Array(pos.length);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.length; i += 3) {
    const t = smooth(clamp((pos[i + 1] + 1) * .5));
    tint.copy(ORANGE).lerp(hash(i / 3, 58) > .7 ? BLUE_HOT : BLUE, t);
    if (t < .38 && hash(i / 3, 59) > .55) tint.copy(ORANGE_HOT);
    write(color, i, tint);
  }
  return color;
}

function duo(count: number, orange: (i: number) => boolean): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) write(out, i * 3, orange(i) ? ORANGE : BLUE);
  return out;
}

function solid(count: number, c: THREE.Color): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) write(out, i * 3, c);
  return out;
}

function write(out: Float32Array, i: number, c: THREE.Color): void {
  out[i] = c.r;
  out[i + 1] = c.g;
  out[i + 2] = c.b;
}

function sampleDot(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.pow(hash(i, 61), .58) * .1;
    const a = hash(i, 62) * Math.PI * 2;
    const b = hash(i, 63) * Math.PI * 2;
    out[i * 3] = Math.cos(a) * Math.sin(b) * r;
    out[i * 3 + 1] = Math.cos(b) * r * .55;
    out[i * 3 + 2] = Math.sin(a) * Math.sin(b) * r;
  }
  return out;
}

function starColors(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const roll = hash(i, 3);
    if (roll > .7) tint.copy(ORANGE).lerp(GAL_GOLD, hash(i, 4));
    else if (roll > .38) tint.copy(GAL_WHITE).lerp(GAL_CYAN, hash(i, 5) * .45);
    else tint.copy(BLUE_HOT).lerp(GAL_WHITE, .55);
    tint.multiplyScalar(.62 + hash(i, 6) * .62);
    write(out, i * 3, tint);
  }
  return out;
}

function sampleRing(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (hash(i, 71) - .5) * .03;
    const role = hash(i, 72);
    let rad = 1;
    let y = 0;
    if (role < .6) {
      const peak = hash(i, 83) > .48 ? .965 : 1.055;
      rad = peak + (hash(i, 73) + hash(i, 74) - 1) * .022;
      y = (hash(i, 75) + hash(i, 76) - 1) * .007;
    } else if (role < .84) {
      rad = 1 + (hash(i, 77) + hash(i, 78) - 1) * .1;
      y = (hash(i, 79) + hash(i, 80) - 1) * .016;
    } else {
      const s = Math.pow(hash(i, 81), .5) * .2;
      const th = hash(i, 82) * Math.PI * 2;
      rad = 1 + Math.cos(th) * s;
      y = Math.sin(th) * s * .32;
    }
    out[i * 3] = Math.cos(a) * rad;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * rad;
  }
  return out;
}

function colorRing(pos: Float32Array): Float32Array {
  const out = new Float32Array(pos.length);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    const rad = Math.hypot(x, z);
    const core = Math.exp(-Math.pow((rad - 1) / .08, 2) - (y * y) / .0006);
    tint.copy(ORANGE);
    tint.multiplyScalar(.18 + core * .95);
    write(out, i, tint);
  }
  return out;
}

function scalePoints(pos: Float32Array, s: number): Float32Array {
  const out = pos.subarray ? pos.slice() : new Float32Array(pos);
  for (let i = 0; i < out.length; i++) out[i] *= s;
  return out;
}

function sampleOnSphere(r: number, i = 0, salt = 0): [number, number, number] {
  const th = hash(i, salt + 1) * Math.PI * 2;
  const ph = Math.acos(2 * hash(i, salt + 2) - 1);
  return [
    r * Math.sin(ph) * Math.cos(th),
    r * Math.cos(ph),
    r * Math.sin(ph) * Math.sin(th)
  ];
}

function sparkSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    g.addColorStop(0, "rgba(255,255,255,.92)");
    g.addColorStop(.38, "rgba(255,255,255,.52)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function discSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function smooth(t: number): number {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return clamp((v - a) / (b - a));
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function hash(i: number, salt: number): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
