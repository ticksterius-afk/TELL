import tellJson from "../../model/tell.json" with { type: "json" };
import type { RecordedFrame, Segment, SegmentKind } from "../src/engine/recorder.ts";
import { validateTellParams } from "../src/engine/tell.ts";
import { rng } from "./helpers.ts";

export const tellParams = validateTellParams(tellJson);

export interface SynthOptions {
  fps?: number;
  seed?: number;
  /** Gaussian-ish noise amplitude on every AU. */
  noise?: number;
  /** Resting level per AU (before noise). */
  rest?: Record<string, number>;
  /** Extra per-AU value as a function of time since segment start (seconds). */
  extra?: (sec: number) => Record<string, number>;
  /** Blink every n seconds (0 = never). */
  blinkEverySec?: number;
  /** Stillness per frame. */
  still?: number;
  quality?: number;
  qualityReason?: RecordedFrame["qualityReason"];
  /** Seconds (since start) at which the face is lost: [from, to] pairs. */
  faceLost?: [number, number][];
  micro?: { at: number; id: string }[];
}

const DEFAULT_REST: Record<string, number> = {
  AU1: 0.05, AU2: 0.05, AU2L: 0.05, AU2R: 0.05, AU2U: 0.02, AU4: 0.05, AU5: 0.02, AU6: 0.05, AU7: 0.05, AU9: 0.02, AU10: 0.05,
  AU12: 0.08, AU12L: 0.08, AU12R: 0.08, AU12U: 0.02, AU14: 0.05, AU14L: 0.05, AU14R: 0.05, AU14U: 0.02, AU15: 0.03, AU17: 0.05,
  AU20: 0.04, AU23: 0.05, AU24: 0.05, AU25: 0.3, AU26: 0.2, AU43: 0.05, STILL: 0.8,
};

/** Builds a segment of recorder frames directly (no engine), for scorer tests. */
export function synthSegment(id: string, kind: SegmentKind, t0: number, seconds: number, o: SynthOptions = {}): Segment {
  const fps = o.fps ?? 30;
  const rnd = rng(o.seed ?? 1);
  const noise = o.noise ?? 0.03;
  const rest = { ...DEFAULT_REST, ...(o.rest ?? {}) };
  const frames: RecordedFrame[] = [];
  const blinks: number[] = [];
  const dtMs = 1000 / fps;
  let nextBlink = o.blinkEverySec ? o.blinkEverySec : Infinity;
  for (let k = 0; k * dtMs < seconds * 1000; k++) {
    const sec = (k * dtMs) / 1000;
    const t = t0 + k * dtMs;
    const lost = (o.faceLost ?? []).some(([a, b]) => sec >= a && sec < b);
    if (lost) {
      frames.push({ t, face: false, aus: {}, pose: { pitch: 0, yaw: 0, roll: 0 }, still: 1, quality: 0 });
      continue;
    }
    const extra = o.extra ? o.extra(sec) : {};
    const aus: Record<string, number> = {};
    for (const [k2, v] of Object.entries(rest)) {
      const n = (rnd() + rnd() + rnd() - 1.5) * noise;
      aus[k2] = Math.max(0, Math.min(1, v + n + (extra[k2] ?? 0)));
    }
    const still = o.still ?? 0.8;
    aus.STILL = still;
    const f: RecordedFrame = { t, face: true, aus, pose: { pitch: 0, yaw: 0, roll: 0 }, still, quality: o.quality ?? 1 };
    if (o.qualityReason) f.qualityReason = o.qualityReason;
    frames.push(f);
    if (sec >= nextBlink) {
      blinks.push(t);
      nextBlink += o.blinkEverySec!;
    }
  }
  const micro = (o.micro ?? []).map((m) => ({ t: t0 + m.at * 1000, id: m.id, peak: 0.7, durationMs: 200 }));
  return { id, kind, t0, t1: t0 + seconds * 1000, frames, blinks, micro };
}
