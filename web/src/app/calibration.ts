import type { EmotionEngine, FrameResult } from "../engine/index.ts";
import { loadRaw, remove, save } from "./storage.ts";

/**
 * Neutral-face calibration shared by the Mien instrument and TELL: the storage
 * keys, restoring and saving the engine's calibrated anchors and personal range
 * gains, and a small driver for the three-second neutral calibration with its
 * progress ring.
 */
export const CALIBRATION_KEY = "calibration.mediapipe";
export const GAINS_KEY = "gains.mediapipe";
/** Circumference of the ring's r=44 circle in the 100×100 viewBox. */
export const RING_LENGTH = 276.46;

/** Restores a previous calibration (and range gains) for this device into the engine. */
export function restoreCalibration(engine: EmotionEngine): boolean {
  const saved = loadRaw<Record<string, number>>(CALIBRATION_KEY);
  if (saved) engine.baseline.setCalibration(saved);
  const gains = loadRaw<Record<string, number>>(GAINS_KEY);
  if (gains) engine.baseline.setGains(gains);
  return saved !== null;
}

export function saveCalibration(engine: EmotionEngine): void {
  const cal = engine.baseline.getCalibration();
  if (cal) save(CALIBRATION_KEY, cal);
}

export function saveGains(engine: EmotionEngine): void {
  save(GAINS_KEY, engine.baseline.getGains());
}

export function hasSavedCalibration(): boolean {
  return loadRaw<Record<string, number>>(CALIBRATION_KEY) !== null;
}

/** Forgets the calibration and gains on this device and in the engine. */
export function forgetCalibration(engine: EmotionEngine): void {
  engine.baseline.reset();
  engine.baseline.resetGains();
  remove(CALIBRATION_KEY);
  remove(GAINS_KEY);
}

/** Sets an SVG ring arc (stroke-dasharray RING_LENGTH) to a 0–1 progress. */
export function setRing(arc: Element | null, progress: number): void {
  if (arc) (arc as SVGElement).style.strokeDashoffset = String(RING_LENGTH * (1 - Math.max(0, Math.min(1, progress))));
}

/**
 * Drives one neutral calibration: call start(), then feed every FrameResult to
 * step(); it returns "done" or "failed" once, "running" while collecting, and
 * null when idle. On "done" the calibration is saved for this device.
 */
export class NeutralCalibration {
  private readonly engine: EmotionEngine;
  private active = false;
  progress = 0;

  constructor(engine: EmotionEngine) {
    this.engine = engine;
  }

  get running(): boolean {
    return this.active;
  }

  start(tMs: number, durationSec = 3): void {
    this.active = true;
    this.progress = 0;
    this.engine.startCalibration(tMs, durationSec);
  }

  cancel(): void {
    this.active = false;
    this.engine.baseline.cancelCalibration();
  }

  step(out: FrameResult): "running" | "done" | "failed" | null {
    if (!this.active) return null;
    this.progress = out.calibration.progress;
    if (!out.calibration.result) return "running";
    this.active = false;
    if (out.calibration.result === "done") {
      saveCalibration(this.engine);
      return "done";
    }
    return "failed";
  }
}
