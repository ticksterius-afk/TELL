/**
 * Developer recorder (Mien app, Settings → Developer): writes the raw
 * measurements of the current camera session in the sequences.json format
 * ({ name, platform, calibration?, gains?, frames: [{ t, m, cmd? }] }) with
 * markers inserted by tapping ("baseline", "statement:1", "end", "false:2",
 * "feed"). Numbers only, never pixels. The files become
 * model/fixtures/tell/*.json and drive the TellScorer's golden tests and tuning.
 */
export interface DevFrame {
  t: number;
  m: Record<string, number> | null;
  cmd?: string;
}

export interface DevRecording {
  name: string;
  platform: "mediapipe";
  about: string;
  recordedAt: string;
  calibration?: Record<string, number>;
  gains?: Record<string, number>;
  frames: DevFrame[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export class DevRecorder {
  private frames: DevFrame[] = [];
  private pending: string[] = [];
  private t0: number | null = null;
  private statement = 0;
  readonly startedAt = new Date();
  lastMarker = "";
  calibration?: Record<string, number>;
  gains?: Record<string, number>;

  /** Queues a marker; it is attached to the next frame. */
  mark(cmd: string): void {
    this.pending.push(cmd);
    this.lastMarker = cmd;
  }

  /** Next statement number, 1-based; "end" first if a segment is open. */
  nextStatement(): string {
    this.statement++;
    const cmd = `statement:${this.statement}`;
    this.mark(cmd);
    return cmd;
  }

  get statementCount(): number {
    return this.statement;
  }

  push(tMs: number, measurements: Record<string, number> | null): void {
    if (this.t0 === null) this.t0 = tMs;
    const m = measurements ? Object.fromEntries(Object.entries(measurements).map(([k, v]) => [k, r4(v)])) : null;
    const f: DevFrame = { t: Math.round(tMs - this.t0), m };
    if (this.pending.length) {
      // Several markers tapped between two frames: one frame each, in the order they were tapped,
      // so an "end" tapped before "statement:2" closes the segment before the next one opens.
      while (this.pending.length > 1) this.frames.push({ t: f.t, m: f.m, cmd: this.pending.shift() });
      f.cmd = this.pending.shift();
    }
    this.frames.push(f);
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get seconds(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t / 1000 : 0;
  }

  toJSON(name: string): DevRecording {
    const rec: DevRecording = {
      name,
      platform: "mediapipe",
      about: "Raw MediaPipe measurements recorded with the Mien developer recorder for TELL fixtures. Numbers only; no imagery. Markers in cmd: baseline, statement:N, end, false:N, feed.",
      recordedAt: this.startedAt.toISOString(),
      frames: this.frames,
    };
    if (this.calibration) rec.calibration = this.calibration;
    if (this.gains && Object.keys(this.gains).length) rec.gains = this.gains;
    return rec;
  }
}

/** Default file name: tell-2026-10-01-1412.json */
export function defaultRecordingName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `tell-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Hands the JSON to the share sheet when files can be shared (phones), otherwise downloads it. */
export async function saveRecording(rec: DevRecording): Promise<"shared" | "downloaded"> {
  const json = JSON.stringify(rec);
  const file = new File([json], `${rec.name}.json`, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: rec.name });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") throw e;
      /* fall through to a download */
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rec.name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
