import type { FrameResult } from "./engine.ts";

/**
 * SessionRecorder: keeps the engine's per-frame output in labelled segments
 * (a talking baseline, statements, a Poker Face feed) so the TellScorer can
 * compare them later. It stores AU intensities, head pose, stillness, the
 * tracking-quality estimate and the engine's blink / brief-expression events.
 * It never sees pixels or raw measurements, so a dump is safe to keep.
 *
 * Platform-independent: only FrameResult-shaped input, plain numbers out.
 */

export interface RecordedFrame {
  /** Timestamp in ms (same clock as the engine). */
  t: number;
  face: boolean;
  aus: Record<string, number>;
  pose: { pitch: number; yaw: number; roll: number };
  /** Head stillness 0–1 (the engine's STILL feature). */
  still: number;
  /** Tracking quality 0–1 (see app/quality.ts); 1 when not measured. */
  quality: number;
  /** Which quality factor was lowest on this frame, for the "unscored" reason. */
  qualityReason?: "size" | "light" | "pose";
}

export interface MicroEvent {
  t: number;
  id: string;
  peak: number;
  durationMs: number;
}

export type SegmentKind = "baseline" | "statement" | "feed";

export interface Segment {
  id: string;
  kind: SegmentKind;
  t0: number;
  t1: number | null;
  frames: RecordedFrame[];
  /** Blink times in ms (the moment the eyes reopened). */
  blinks: number[];
  micro: MicroEvent[];
}

export interface SessionDump {
  version: 1;
  auIds: string[];
  segments: Segment[];
}

/** AU channels kept per frame by default: the ones the scorer and the replay heat-map read. */
export const DEFAULT_TELL_AUS: readonly string[] = [
  "AU1", "AU2", "AU2L", "AU2R", "AU2U", "AU4", "AU5", "AU6", "AU7", "AU9", "AU10",
  "AU12", "AU12L", "AU12R", "AU12U", "AU14", "AU14L", "AU14R", "AU14U", "AU15", "AU17",
  "AU20", "AU23", "AU24", "AU25", "AU26", "AU43", "STILL",
];

export interface QualityInput {
  value: number;
  reason?: RecordedFrame["qualityReason"];
}

export class SessionRecorder {
  readonly auIds: string[];
  private readonly done: Segment[] = [];
  private open: Segment | null = null;

  constructor(auIds: readonly string[] = DEFAULT_TELL_AUS) {
    this.auIds = [...auIds];
  }

  /** Starts a segment; an open segment is closed first (at the same time). */
  begin(id: string, kind: SegmentKind, t: number): void {
    if (this.open) this.end(t);
    this.open = { id, kind, t0: t, t1: null, frames: [], blinks: [], micro: [] };
  }

  /** Appends one engine frame (and its events) to the open segment. */
  push(r: FrameResult, quality: QualityInput = { value: 1 }): void {
    const s = this.open;
    if (!s) return;
    const aus: Record<string, number> = {};
    if (r.face) for (const id of this.auIds) aus[id] = r.aus[id] ?? 0;
    const frame: RecordedFrame = {
      t: r.t,
      face: r.face,
      aus,
      pose: { pitch: r.pose.pitch, yaw: r.pose.yaw, roll: r.pose.roll },
      still: r.face ? r.aus.STILL ?? 1 : 1,
      quality: r.face ? quality.value : 0,
    };
    if (r.face && quality.reason) frame.qualityReason = quality.reason;
    s.frames.push(frame);
    for (const e of r.events) {
      if (e.type === "blink") s.blinks.push(e.t);
      else if (e.type === "micro") s.micro.push({ t: e.t, id: e.id, peak: e.peak, durationMs: e.durationMs });
    }
  }

  /** Closes the open segment and returns it. Throws if nothing is open. */
  end(t: number): Segment {
    const s = this.open;
    if (!s) throw new Error("SessionRecorder.end: no open segment");
    s.t1 = Math.max(t, s.t0);
    this.open = null;
    this.done.push(s);
    return s;
  }

  get current(): Segment | null {
    return this.open;
  }

  /** Closed segments, in order. */
  segments(): Segment[] {
    return [...this.done];
  }

  find(id: string): Segment | undefined {
    return this.done.find((s) => s.id === id);
  }

  /** Forgets every segment (a new round or a new player). */
  clear(): void {
    this.done.length = 0;
    this.open = null;
  }

  /** Numbers only: AUs, pose, stillness, quality and events. No pixels, no raw measurements. */
  toJSON(): SessionDump {
    return { version: 1, auIds: [...this.auIds], segments: this.segments().map(cloneSegment) };
  }

  static fromJSON(dump: SessionDump): SessionRecorder {
    const rec = new SessionRecorder(dump.auIds);
    for (const s of dump.segments) rec.done.push(cloneSegment(s));
    return rec;
  }
}

function cloneSegment(s: Segment): Segment {
  return {
    id: s.id,
    kind: s.kind,
    t0: s.t0,
    t1: s.t1,
    frames: s.frames.map((f) => ({ ...f, aus: { ...f.aus }, pose: { ...f.pose } })),
    blinks: [...s.blinks],
    micro: s.micro.map((m) => ({ ...m })),
  };
}

/** Duration of a segment in seconds (0 while still open). */
export function segmentSeconds(s: Segment): number {
  return s.t1 === null ? 0 : (s.t1 - s.t0) / 1000;
}
