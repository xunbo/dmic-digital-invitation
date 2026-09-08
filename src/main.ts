import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { BrandCloud } from "./cloud";
import { ScrollVideo } from "./scrub-video";
import "./styles.css";

gsap.registerPlugin(ScrollTrigger);

const canvas = must<HTMLCanvasElement>("#gl");
const video = must<HTMLVideoElement>("#hero-video");
const mark = document.querySelector<HTMLElement>("[data-mark]");
const cue = document.querySelector<HTMLElement>("[data-cue]");
const veil = document.querySelector<HTMLElement>(".veil");
const bar = document.querySelector<HTMLElement>("[data-bar]");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const cloud = await BrandCloud.create(canvas);
const scrub = reduced ? null : new ScrollVideo(video);

const lenis = new Lenis({
  lerp: .055,
  smoothWheel: !reduced,
  syncTouch: true,
  wheelMultiplier: .62,
  touchMultiplier: .52
});
lenis.stop();
Object.assign(window, { __invite: { lenis, video, cloud } });

const BEATS: { id: string; start: number; end: number }[] = [
  { id: "open", start: .108, end: .22 },
  { id: "leaf", start: .2, end: .385 },
  { id: "human", start: .405, end: .505 },
  { id: "swirl", start: .525, end: .605 },
  { id: "origin", start: .612, end: .642 },
  { id: "scan-1", start: .672, end: .709 },
  { id: "scan-2", start: .709, end: .737 },
  { id: "scan-3", start: .737, end: .766 },
  { id: "scan-4", start: .766, end: .794 },
  { id: "scan-5", start: .794, end: .823 },
  { id: "scan-6", start: .823, end: .851 },
  { id: "scan-7", start: .851, end: .952 },
  { id: "finale", start: .972, end: 1.01 }
];

let shownBeat = "";
let beatTimer = 0;

function applyBeat(next: string): void {
  if (next === shownBeat) return;
  const prev = shownBeat;
  shownBeat = next;
  window.clearTimeout(beatTimer);
  document.querySelectorAll("[data-beat]").forEach((node) => {
    node.classList.remove("is-active");
  });
  if (!next) return;
  const gap = Boolean(prev) && !reduced;
  beatTimer = window.setTimeout(() => {
    document.querySelectorAll("[data-beat]").forEach((node) => {
      node.classList.toggle("is-active", node.getAttribute("data-beat") === next);
    });
  }, gap ? 80 : 0);
}

function pageProgress(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function applyVisuals(): void {
  const journey = document.body.classList.contains("is-journey") ? pageProgress() : 0;
  if (Math.abs(journey - lastJourney) > .00001) {
    lastJourney = journey;
    noteMotion(true);
  } else {
    noteMotion(false);
  }
  cloud.setJourney(journey);
  if (journey > .04) leftTop = true;
  const frame = cloud.frame();
  video.style.opacity = String(frame.videoOpacity * .88);
  const videoY = (1 - frame.videoLift) * 100 - frame.videoExit * 110;
  video.style.transform = frame.videoLift > 0 || frame.videoOpacity > 0 || frame.videoExit > 0
    ? `translate(-50%, ${videoY}%)`
    : "translateX(-50%)";
  if (scrub) scrub.set(frame.videoLift > .97 ? frame.video : 0);
  if (veil) veil.style.opacity = frame.videoOpacity > .2 ? String(.1 + (1 - frame.videoOpacity) * .35) : "1";
  document.body.classList.toggle("is-scan", frame.videoOpacity > .2);
  const showLogo = !document.body.classList.contains("is-journey") && !document.body.classList.contains("is-exploding");
  mark?.classList.toggle("is-hidden", !showLogo);

  const beat = BEATS.find((item) => journey >= item.start && journey < item.end)?.id ?? "";
  applyBeat(beat);
  document.body.classList.toggle("is-copy", journey >= .108 && journey < .965);
  if (bar) bar.style.transform = `scaleX(${document.body.classList.contains("is-journey") ? journey : 0})`;
}

let lastJourney = -1;
let lastMotion = performance.now();
let overscrollUp = 0;
let overscrollAt = 0;
let leftTop = false;

function noteMotion(active: boolean): void {
  if (active) {
    lastMotion = performance.now();
    cloud.setStill(false);
    return;
  }
  cloud.setStill(performance.now() - lastMotion > 220);
}

lenis.on("scroll", () => {
  noteMotion(true);
  applyVisuals();
  ScrollTrigger.update();
});
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
  applyVisuals();
});
gsap.ticker.lagSmoothing(0);

function pin(section: string, steps: number): void {
  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: `+=${window.innerHeight * steps}`,
    pin: true,
    scrub: 1
  });
}

ScrollTrigger.create({
  trigger: "#hero",
  start: "top top",
  end: "bottom top",
  scrub: true
});

pin("#open", 7);
pin("#story", 15.6);
pin("#scan", 20);
pin("#invite", 7);
ScrollTrigger.refresh();

function explode(): void {
  if (document.body.classList.contains("is-journey") || document.body.classList.contains("is-exploding")) return;
  document.body.classList.add("is-exploding");
  if (cue) cue.dataset.mode = "scroll";
  const state = { t: 0 };
  gsap.to(state, {
    t: 1,
    duration: 1.15,
    ease: "power3.out",
    onUpdate: () => {
      cloud.setExplode(state.t);
      noteMotion(true);
    },
    onComplete: () => {
      document.body.classList.remove("is-exploding");
      document.body.classList.add("is-journey");
      overscrollUp = 0;
      leftTop = false;
      lenis.start();
      applyVisuals();
    }
  });
}

function atJourneyTop(): boolean {
  return document.body.classList.contains("is-journey")
    && !document.body.classList.contains("is-exploding")
    && window.scrollY < 10
    && pageProgress() < .012;
}

function noteOverscrollUp(): void {
  if (!leftTop || !atJourneyTop()) {
    overscrollUp = 0;
    return;
  }
  const now = performance.now();
  if (now - overscrollAt > 1100) overscrollUp = 0;
  overscrollAt = now;
  overscrollUp += 1;
  if (overscrollUp < 2) return;
  overscrollUp = 0;
  collapse();
}

function collapse(): void {
  if (!document.body.classList.contains("is-journey") || document.body.classList.contains("is-exploding")) return;
  document.body.classList.add("is-exploding");
  document.body.classList.remove("is-journey", "is-scan");
  lenis.stop();
  lenis.scrollTo(0, { immediate: true });
  window.scrollTo(0, 0);
  if (cue) delete cue.dataset.mode;
  const state = { t: 1 };
  gsap.to(state, {
    t: 0,
    duration: .85,
    ease: "power3.inOut",
    onUpdate: () => {
      cloud.setExplode(state.t);
      noteMotion(true);
    },
    onComplete: () => {
      document.body.classList.remove("is-exploding");
      cloud.setExplode(0);
      applyVisuals();
    }
  });
}

bindOrbit();
bindGyro();
mark?.addEventListener("click", explode);
must("#hero").addEventListener("click", explode);

if (reduced) {
  cloud.setExplode(1);
  document.body.classList.add("is-journey");
  lenis.start();
}

applyVisuals();

window.addEventListener("resize", () => {
  ScrollTrigger.refresh();
});

function bindGyro(): void {
  if (reduced || !mobileGyro()) return;
  let baseX: number | null = null;
  let baseY: number | null = null;
  let started = false;

  const apply = (beta: number, gamma: number): void => {
    const angle = screen.orientation?.angle
      ?? (window as Window & { orientation?: number }).orientation
      ?? 0;
    let x = gamma;
    let y = beta;
    if (angle === 90) {
      x = beta;
      y = -gamma;
    } else if (angle === 180) {
      x = -gamma;
      y = -beta;
    } else if (angle === 270 || angle === -90) {
      x = -beta;
      y = gamma;
    }
    if (baseX == null || baseY == null) {
      baseX = x;
      baseY = y;
    }
    baseX += (x - baseX) * .004;
    baseY += (y - baseY) * .004;
    cloud.setTilt(
      Math.max(-1, Math.min(1, (x - baseX) / 16)),
      Math.max(-1, Math.min(1, (baseY - y) / 20))
    );
  };

  const onOrient = (event: DeviceOrientationEvent): void => {
    if (event.beta == null || event.gamma == null) return;
    apply(event.beta, event.gamma);
  };

  const start = async (): Promise<void> => {
    if (started) return;
    started = true;
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      return;
    }
    window.addEventListener("deviceorientation", onOrient, true);
  };

  window.addEventListener("pointerdown", () => { void start(); }, { once: true });
}

function mobileGyro(): boolean {
  return "DeviceOrientationEvent" in window;
}

function bindOrbit(): void {
  const root = must("#app");
  let px = 0;
  let py = 0;
  let mode: "none" | "spin" | "scroll" = "none";
  let dragged = false;
  let pointer = -1;
  let pullY = 0;

  const down = (x: number, y: number, id: number): void => {
    px = x;
    py = y;
    mode = "none";
    dragged = false;
    pointer = id;
    pullY = 0;
  };

  const move = (x: number, y: number, event: Event): void => {
    if (pointer < 0) return;
    const dx = x - px;
    const dy = y - py;
    if (mode === "none") {
      if (Math.hypot(dx, dy) < 8) return;
      mode = Math.abs(dx) > Math.abs(dy) * 1.1 ? "spin" : "scroll";
    }
    if (mode === "scroll") {
      pullY += dy;
      px = x;
      py = y;
      return;
    }
    if (mode !== "spin") return;
    dragged = true;
    cloud.addYaw(dx * .0075);
    noteMotion(true);
    px = x;
    py = y;
    event.preventDefault();
  };

  const up = (): void => {
    if (mode === "scroll" && pullY > 36) noteOverscrollUp();
    else if (mode === "scroll" && pullY < -20) overscrollUp = 0;
    pointer = -1;
    mode = "none";
    pullY = 0;
  };

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    down(event.clientX, event.clientY, event.pointerId);
  });
  window.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer) return;
    move(event.clientX, event.clientY, event);
  }, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  root.addEventListener("click", (event) => {
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
    dragged = false;
  }, true);

  let wheelLock = 0;
  window.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) >= 2) {
      cloud.addYaw(event.deltaX * .003);
      noteMotion(true);
      event.preventDefault();
      return;
    }
    if (event.deltaY < -2 && atJourneyTop()) {
      const now = performance.now();
      if (now - wheelLock > 380) {
        wheelLock = now;
        noteOverscrollUp();
      }
    } else if (event.deltaY > 2) {
      overscrollUp = 0;
    }
  }, { passive: false });
}

function must<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`missing ${sel}`);
  return node;
}
