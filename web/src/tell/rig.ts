import { CameraError, openCamera, stopSource } from "../app/camera.ts";
import { restoreCalibration } from "../app/calibration.ts";
import { MODEL } from "../app/model.ts";
import { drawFaceMesh } from "../app/overlay.ts";
import { estimateQuality, NO_FACE_QUALITY, type Quality } from "../app/quality.ts";
import { Tracker, type TrackedFace } from "../app/tracker.ts";
import { EmotionEngine, type FrameResult } from "../engine/index.ts";
import type { MeshFrame } from "./state.ts";

export interface Frame {
  out: FrameResult;
  face: TrackedFace | null;
  quality: Quality;
}

export type FrameListener = (f: Frame) => void;

/**
 * Camera, tracker and engine for TELL. The stream stays open for a whole
 * round; frames are analysed only while `active` (a camera screen is up), and
 * the stage shows a recording indicator whenever they are.
 */
export class CameraRig {
  readonly video: HTMLVideoElement;
  readonly stage: HTMLElement;
  readonly engine: EmotionEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private tracker: Tracker | null = null;
  private listeners = new Set<FrameListener>();
  private lastVideoTime = -1;
  private loopRunning = false;
  private activeFlag = false;
  private noFaceSince: number | null = null;
  mirror = true;
  /** Draw the (uncoloured) mesh over the face while analysing. */
  showMesh = true;
  last: Frame | null = null;
  streaming = false;

  constructor(stage: HTMLElement, video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.stage = stage;
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.engine = new EmotionEngine(MODEL, "mediapipe");
    restoreCalibration(this.engine);
  }

  /** Opens the camera and loads the face model (idempotent). Throws CameraError with a readable message. */
  async start(): Promise<void> {
    this.tracker ??= await Tracker.create("GPU");
    if (!this.streaming) {
      await openCamera(this.video, "user");
      this.streaming = true;
    }
    this.applyMirror();
    if (this.activeFlag && !this.loopRunning) {
      this.loopRunning = true;
      this.schedule();
    }
  }

  stop(): void {
    this.active = false;
    stopSource(this.video);
    this.streaming = false;
    this.stage.hidden = true;
  }

  /** Whether frames are analysed right now (camera screens set this). */
  get active(): boolean {
    return this.activeFlag;
  }

  set active(on: boolean) {
    if (on === this.activeFlag) return;
    this.activeFlag = on;
    this.stage.hidden = !on;
    if (on && this.streaming && !this.loopRunning) {
      this.loopRunning = true;
      this.schedule();
    }
  }

  onFrame(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  applyMirror(): void {
    this.stage.classList.toggle("mirrored", this.mirror);
  }

  /** Time (ms) since the face was last seen, or 0. */
  faceLostMs(now: number): number {
    return this.noFaceSince === null ? 0 : now - this.noFaceSince;
  }

  private schedule(): void {
    if (!this.activeFlag || !this.streaming) {
      this.loopRunning = false;
      return;
    }
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.frame());
    else requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    if (!this.activeFlag || !this.tracker) {
      this.loopRunning = false;
      return;
    }
    const video = this.video;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime && !document.hidden) {
      this.lastVideoTime = video.currentTime;
      const t = performance.now();
      const face = this.tracker.detect(video, t);
      const out = this.engine.process(t, face?.measurements ?? null);
      const quality = face ? estimateQuality({ boxHeight: face.boxHeight, luminance: face.luminance, yaw: out.pose.yaw, pitch: out.pose.pitch }) : NO_FACE_QUALITY;
      if (face) this.noFaceSince = null;
      else this.noFaceSince ??= t;
      const f: Frame = { out, face, quality };
      this.last = f;
      this.drawMesh(face);
      for (const cb of this.listeners) cb(f);
    }
    this.schedule();
  }

  /** A plain white mesh: shows that tracking works without showing any score. */
  private drawMesh(face: TrackedFace | null): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const hgt = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== hgt) {
      c.width = w;
      c.height = hgt;
    }
    this.ctx.clearRect(0, 0, w, hgt);
    if (!face || !this.showMesh || !this.video.videoWidth) return;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const s = Math.max(w / vw, hgt / vh);
    const ox = (w - vw * s) / 2;
    const oy = (hgt - vh * s) / 2;
    const lm = face.landmarks;
    drawFaceMesh(this.ctx, (i) => ox + lm[i].x * vw * s, (i) => oy + lm[i].y * vh * s, {}, {}, "regions", this.mirror, dpr);
  }

  /** Captures the current face points for the replay (numbers in memory only). */
  meshFrame(f: Frame): MeshFrame | null {
    if (!f.face) return null;
    const lm = f.face.landmarks;
    const xy = new Float32Array(lm.length * 2);
    for (let i = 0; i < lm.length; i++) {
      xy[i * 2] = lm[i].x;
      xy[i * 2 + 1] = lm[i].y;
    }
    return { t: f.out.t, xy, regions: { ...f.out.regions } };
  }

  get videoSize(): { width: number; height: number } {
    return { width: this.video.videoWidth || 1280, height: this.video.videoHeight || 720 };
  }
}

export { CameraError };
