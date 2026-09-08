export class ScrollVideo {
  private progress = 0;
  private duration = 0;
  private seeking = false;
  private unlocked = false;
  private raf = 0;
  private readonly onUnlock = () => {
    void this.unlock();
  };

  constructor(private readonly video: HTMLVideoElement) {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.loop = false;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.pause();

    const ready = () => {
      this.duration = Number.isFinite(video.duration) ? video.duration : 0;
      this.apply();
    };
    if (video.readyState >= 1) ready();
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("durationchange", ready);
    video.addEventListener("seeked", () => {
      this.seeking = false;
    });

    window.addEventListener("pointerdown", this.onUnlock, { passive: true });
    window.addEventListener("touchstart", this.onUnlock, { passive: true });
    void this.unlock();
    this.raf = requestAnimationFrame(this.tick);
  }

  set(progress: number): void {
    this.progress = Math.min(1, Math.max(0, progress));
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    try {
      await this.video.play();
      this.video.pause();
      this.unlocked = true;
    } catch {
      // iOS waits for a real gesture
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("pointerdown", this.onUnlock);
    window.removeEventListener("touchstart", this.onUnlock);
  }

  private tick = (): void => {
    this.apply();
    this.raf = requestAnimationFrame(this.tick);
  };

  private apply(): void {
    if (!this.duration || this.video.readyState < 2 || this.seeking) return;
    const target = this.progress * Math.max(0, this.duration - 1 / 24);
    if (Math.abs(this.video.currentTime - target) < 1 / 48) return;
    this.seeking = true;
    this.video.currentTime = target;
    window.setTimeout(() => {
      this.seeking = false;
    }, 48);
  }
}
