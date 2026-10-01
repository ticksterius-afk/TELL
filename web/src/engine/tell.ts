import { clamp01, emaAlpha, smoothstep } from "./filters.ts";
import { segmentSeconds, type RecordedFrame, type Segment } from "./recorder.ts";

/**
 * TellScorer: compares a statement with the same person's talking baseline
 * from the same session and reports how much the face deviated from it.
 *
 * Everything is relative to that person, that session, that lighting. The
 * components are the within-person cues with the best evidence (see the
 * Science screen): blink suppression (Leal & Vrij 2008; Perelman 2014), a
 * smile leaking through (ten Brinke & Porter 2012), raised brows (ten Brinke &
 * Porter 2012), one-sided movement (Ekman, Hager & Friesen 1981), brief
 * expressions (Porter & ten Brinke 2008, rare) and stillness (DePaulo 2003,
 * weight 0 by default). The output is a "tell" score, never a verdict.
 *
 * Platform-independent: plain numbers in (recorder segments + model/tell.json),
 * plain numbers out, so it can be ported to Swift line for line.
 */

export type ComponentId = "blink" | "leak12" | "brows" | "asym" | "micro" | "freeze";
export const COMPONENT_IDS: readonly ComponentId[] = ["blink", "leak12", "brows", "asym", "micro", "freeze"];

/** Names shown in the UI. Movement words only: no emotion labels, no verdicts. */
export const COMPONENT_NAMES: Record<ComponentId, string> = {
  blink: "Blink suppression",
  leak12: "Smile leak",
  brows: "Raised brows",
  asym: "One-sided movement",
  micro: "Brief expressions",
  freeze: "Stillness",
};

export interface TellParams {
  version: string;
  about: string;
  aus: string[];
  baseline: { grow: boolean; minFrames: number; defaultIbiSec: number };
  blink: { ibiFactor: number; lo: number; hi: number };
  leakScale: number;
  au6Weight: number;
  asymScale: number;
  microPerStatement: number;
  freezeScale: number;
  weights: Record<ComponentId, number>;
  display: { curve: number; captionMin: number; maxCaptions: number };
  intensity: { leak: number; asym: number; brow: number; tauMs: number; microStep: number; microDecayMs: number; peakWindowSec: number; peakMin: number };
  quality: { minFaceSec: number; minMean: number; maxGapSec: number };
  pokerface: { channels: string[]; baselineSec: number; margin: number; scale: number; bins: number; binSec: number; binLevels: [number, number, number] };
}

/** Throws with a readable message when tell.json is malformed. Returns the typed params. */
export function validateTellParams(raw: unknown): TellParams {
  const p = raw as TellParams;
  const num = (v: unknown, name: string) => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`tell.json: ${name} must be a finite number`);
  };
  if (!p || typeof p !== "object") throw new Error("tell.json: not an object");
  if (typeof p.version !== "string" || !/^\d+\.\d+\.\d+$/.test(p.version)) throw new Error("tell.json: version must be semver");
  if (!Array.isArray(p.aus) || !p.aus.every((a) => typeof a === "string")) throw new Error("tell.json: aus must be a string list");
  for (const k of ["leakScale", "au6Weight", "asymScale", "microPerStatement", "freezeScale"] as const) num(p[k], k);
  if (p.leakScale <= 0 || p.asymScale <= 0 || p.freezeScale <= 0 || p.microPerStatement <= 0) throw new Error("tell.json: scales must be positive");
  num(p.baseline?.minFrames, "baseline.minFrames");
  num(p.baseline?.defaultIbiSec, "baseline.defaultIbiSec");
  if (typeof p.baseline.grow !== "boolean") throw new Error("tell.json: baseline.grow must be boolean");
  for (const k of ["ibiFactor", "lo", "hi"] as const) num(p.blink?.[k], `blink.${k}`);
  if (!(p.blink.hi > p.blink.lo)) throw new Error("tell.json: blink.hi must exceed blink.lo");
  let sum = 0;
  for (const id of COMPONENT_IDS) {
    num(p.weights?.[id], `weights.${id}`);
    if (p.weights[id] < 0) throw new Error(`tell.json: weights.${id} must be >= 0`);
    sum += p.weights[id];
  }
  if (sum <= 0) throw new Error("tell.json: weights must not all be zero");
  for (const k of Object.keys(p.weights)) if (!COMPONENT_IDS.includes(k as ComponentId)) throw new Error(`tell.json: unknown weight ${k}`);
  for (const k of ["curve", "captionMin", "maxCaptions"] as const) num(p.display?.[k], `display.${k}`);
  for (const k of ["leak", "asym", "brow", "tauMs", "microStep", "microDecayMs", "peakWindowSec", "peakMin"] as const) num(p.intensity?.[k], `intensity.${k}`);
  for (const k of ["minFaceSec", "minMean", "maxGapSec"] as const) num(p.quality?.[k], `quality.${k}`);
  const pf = p.pokerface;
  if (!pf || !Array.isArray(pf.channels) || pf.channels.length === 0) throw new Error("tell.json: pokerface.channels");
  for (const k of ["baselineSec", "margin", "scale", "bins", "binSec"] as const) num(pf[k], `pokerface.${k}`);
  if (!Array.isArray(pf.binLevels) || pf.binLevels.length !== 3) throw new Error("tell.json: pokerface.binLevels must have 3 thresholds");
  for (let i = 0; i < 3; i++) num(pf.binLevels[i], `pokerface.binLevels[${i}]`);
  return p;
}

// ------------------------------------------------------------------ channels

/** Derived channels the scorer reads on top of the recorded AUs. */
export const BROWS = "BROWS"; // (AU1 + AU2) / 2
export const ASYM = "ASYM"; // max(AU12U, AU14U, AU2U)

export function channel(f: RecordedFrame, id: string): number {
  const a = f.aus;
  if (id === BROWS) return ((a.AU1 ?? 0) + (a.AU2 ?? 0)) / 2;
  if (id === ASYM) return Math.max(a.AU12U ?? 0, a.AU14U ?? 0, a.AU2U ?? 0);
  return a[id] ?? 0;
}

const STAT_CHANNELS = ["AU12", "AU6", BROWS, ASYM] as const;

// ------------------------------------------------------------------ statistics

export interface BaselineStats {
  frames: number;
  faceSec: number;
  p50: Record<string, number>;
  p90: Record<string, number>;
  /** Median inter-blink interval in seconds (defaultIbiSec when fewer than two blinks). */
  ibiMedianSec: number;
  /** Longest stretch with the eyes open and the face in view, seconds. */
  longestOpenSec: number;
  blinks: number;
  microPerMin: number;
  stillMean: number;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Per-frame integration weight in seconds: the gap to the next frame, capped
 * so a dropped tracker or a lost face does not count as a long-held value.
 * Frames without a face weigh 0.
 */
export function frameWeights(frames: RecordedFrame[], maxGapSec: number): number[] {
  const n = frames.length;
  const w = new Array<number>(n).fill(0);
  let typical = 1 / 30;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < n; i++) gaps.push((frames[i + 1].t - frames[i].t) / 1000);
  if (gaps.length) typical = quantile([...gaps].sort((a, b) => a - b), 0.5) || typical;
  for (let i = 0; i < n; i++) {
    if (!frames[i].face) continue;
    const gap = i + 1 < n ? gaps[i] : typical;
    w[i] = Math.min(maxGapSec, Math.max(0, gap));
  }
  return w;
}

/** Longest stretch (s) with eyes open: broken by blinks and by frames without a face. */
export function longestOpen(frames: RecordedFrame[], blinks: number[], t0: number, t1: number, maxGapSec: number): number {
  const breaks = [...blinks.filter((b) => b >= t0 && b <= t1)];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f.face) breaks.push(f.t);
    else if (i > 0 && frames[i].t - frames[i - 1].t > maxGapSec * 1000) breaks.push(f.t);
  }
  breaks.sort((a, b) => a - b);
  let best = 0;
  let prev = t0;
  for (const b of breaks) {
    best = Math.max(best, b - prev);
    prev = b;
  }
  best = Math.max(best, t1 - prev);
  return Math.max(0, best / 1000);
}

function weightedMean(values: number[], w: number[]): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i] * w[i];
    n += w[i];
  }
  return n > 0 ? s / n : 0;
}

export function baselineStats(segments: Segment[], p: TellParams): BaselineStats {
  const series: Record<string, number[]> = {};
  for (const c of STAT_CHANNELS) series[c] = [];
  const stills: number[] = [];
  const stillW: number[] = [];
  let frames = 0;
  let faceSec = 0;
  let blinks = 0;
  let micro = 0;
  let longest = 0;
  const ibis: number[] = [];
  for (const s of segments) {
    const t1 = s.t1 ?? (s.frames.length ? s.frames[s.frames.length - 1].t : s.t0);
    const w = frameWeights(s.frames, p.quality.maxGapSec);
    for (let i = 0; i < s.frames.length; i++) {
      const f = s.frames[i];
      if (!f.face) continue;
      frames++;
      faceSec += w[i];
      for (const c of STAT_CHANNELS) series[c].push(channel(f, c));
      stills.push(f.still);
      stillW.push(w[i]);
    }
    const b = s.blinks.filter((t) => t >= s.t0 && t <= t1).sort((x, y) => x - y);
    blinks += b.length;
    for (let i = 1; i < b.length; i++) ibis.push((b[i] - b[i - 1]) / 1000);
    micro += s.micro.length;
    longest = Math.max(longest, longestOpen(s.frames, s.blinks, s.t0, t1, p.quality.maxGapSec));
  }
  const p50: Record<string, number> = {};
  const p90: Record<string, number> = {};
  for (const c of STAT_CHANNELS) {
    const sorted = series[c].sort((a, b) => a - b);
    p50[c] = quantile(sorted, 0.5);
    p90[c] = quantile(sorted, 0.9);
  }
  ibis.sort((a, b) => a - b);
  return {
    frames,
    faceSec,
    p50,
    p90,
    ibiMedianSec: ibis.length ? quantile(ibis, 0.5) : p.baseline.defaultIbiSec,
    longestOpenSec: longest,
    blinks,
    microPerMin: faceSec > 0 ? micro / (faceSec / 60) : 0,
    stillMean: weightedMean(stills, stillW),
  };
}

// ------------------------------------------------------------------ scoring

export interface PeakWindow {
  /** Window bounds in ms (same clock as the frames). */
  t0: number;
  t1: number;
  /** Mean intensity inside the window. */
  mean: number;
  /** True when no frame cleared intensity.peakMin: the window is the statement's middle. */
  quiet: boolean;
  /** Index range [from, to) into the segment's frames. */
  from: number;
  to: number;
}

export interface ComponentDetail {
  id: ComponentId;
  name: string;
  value: number;
  /** Component-specific numbers behind the caption (for the Science screen and tests). */
  info: Record<string, number | string>;
}

export interface TellResult {
  id: string;
  status: "scored" | "unscored";
  /** Why a statement was not scored: "too short", "too dark" or "face out of frame". */
  reason?: string;
  /** Display score 0–100 (after the display curve). 0 when unscored. */
  score: number;
  /** Weighted component mean 0–100 before the display curve. */
  raw: number;
  components: Record<ComponentId, number>;
  details: ComponentDetail[];
  /** Per-frame tell intensity 0–1, aligned with the segment's frames. */
  intensity: number[];
  peak: PeakWindow;
  /** Up to display.maxCaptions templated captions, strongest component first. */
  captions: string[];
  /** The caption shown over the replay. */
  replayCaption: string;
  /** Short chips, e.g. "Eyes open 6.2 s". */
  chips: string[];
  faceSec: number;
  qualityMean: number;
  baseline: BaselineStats;
}

export class TellScorer {
  readonly p: TellParams;
  private base: Segment[] = [];

  constructor(params: TellParams) {
    this.p = params;
  }

  /** Replaces the session baseline (the talking baseline segment, possibly several). */
  setBaseline(...segments: Segment[]): void {
    this.base = [...segments];
  }

  get baselineSegments(): Segment[] {
    return [...this.base];
  }

  stats(extra: Segment[] = []): BaselineStats {
    return baselineStats([...this.base, ...extra], this.p);
  }

  /**
   * Scores every statement. With baseline.grow, each statement is compared
   * against the baseline plus the *other* statements (leave-one-out), so the
   * reference is "how this person talks in this session" rather than one
   * 12-second clip.
   */
  scoreAll(statements: Segment[]): TellResult[] {
    return statements.map((s) => this.score(s, this.p.baseline.grow ? statements.filter((o) => o !== s) : []));
  }

  score(seg: Segment, others: Segment[] = []): TellResult {
    const p = this.p;
    const stats = this.stats(others);
    const frames = seg.frames;
    const t1 = seg.t1 ?? (frames.length ? frames[frames.length - 1].t : seg.t0);
    const w = frameWeights(frames, p.quality.maxGapSec);
    const faceSec = w.reduce((a, b) => a + b, 0);
    const duration = Math.max(segmentSeconds(seg), (t1 - seg.t0) / 1000);
    const intensity = this.intensitySeries(seg, stats);
    const peak = this.peakWindow(seg, intensity);
    const qualityMean = weightedMean(frames.map((f) => f.quality), w);

    const empty = (): Record<ComponentId, number> => ({ blink: 0, leak12: 0, brows: 0, asym: 0, micro: 0, freeze: 0 });
    const unscored = (reason: string): TellResult => ({
      id: seg.id, status: "unscored", reason, score: 0, raw: 0, components: empty(), details: [], intensity, peak,
      captions: [], replayCaption: "Not scored: " + reason + ".", chips: [], faceSec, qualityMean, baseline: stats,
    });
    if (faceSec < p.quality.minFaceSec) return unscored(duration < p.quality.minFaceSec ? "too short" : "face out of frame");
    if (qualityMean < p.quality.minMean) {
      const reasons = { size: 0, light: 0, pose: 0 };
      for (let i = 0; i < frames.length; i++) if (frames[i].face && frames[i].quality < p.quality.minMean && frames[i].qualityReason) reasons[frames[i].qualityReason!] += w[i];
      return unscored(reasons.light > Math.max(reasons.size, reasons.pose) ? "too dark" : "face out of frame");
    }

    // --- components
    const excess = (id: string, scale: number) => frames.map((f) => (f.face ? Math.max(0, channel(f, id) - stats.p90[id]) / scale : 0));
    const au12 = excess("AU12", p.leakScale);
    const au6 = excess("AU6", p.leakScale);
    const brow = excess(BROWS, p.leakScale);
    const asym = excess(ASYM, p.asymScale);

    const longest = longestOpen(frames, seg.blinks, seg.t0, t1, p.quality.maxGapSec);
    const reference = Math.max(stats.longestOpenSec, stats.ibiMedianSec * p.blink.ibiFactor);
    const blinkRatio = reference > 0 ? longest / reference : 0;
    const c: Record<ComponentId, number> = {
      blink: smoothstep(p.blink.lo, p.blink.hi, blinkRatio),
      leak12: clamp01(weightedMean(au12, w) + p.au6Weight * weightedMean(au6, w)),
      brows: clamp01(weightedMean(brow, w)),
      asym: clamp01(weightedMean(asym, w)),
      micro: clamp01(seg.micro.length / p.microPerStatement),
      freeze: clamp01(Math.max(0, weightedMean(frames.map((f) => f.still), w) - stats.stillMean) / p.freezeScale),
    };

    let num = 0;
    let den = 0;
    for (const id of COMPONENT_IDS) {
      num += p.weights[id] * c[id];
      den += p.weights[id];
    }
    const raw01 = den > 0 ? clamp01(num / den) : 0;
    const raw = 100 * raw01;
    const score = Math.round(100 * Math.pow(raw01, p.display.curve));

    // --- captions
    const argmax = (xs: number[]) => xs.reduce((best, v, i) => (v > xs[best] ? i : best), 0);
    const at = (i: number) => `${((frames[i].t - seg.t0) / 1000).toFixed(1)} s`;
    const au12Part = weightedMean(au12, w);
    const au6Part = p.au6Weight * weightedMean(au6, w);
    const asymIdx = argmax(asym);
    const details: ComponentDetail[] = [
      { id: "blink", name: COMPONENT_NAMES.blink, value: c.blink, info: { longestOpenSec: longest, referenceSec: reference, ratio: blinkRatio, blinks: seg.blinks.length } },
      { id: "leak12", name: COMPONENT_NAMES.leak12, value: c.leak12, info: { au12: au12Part, au6: au6Part, peakAt: frames.length ? (frames[argmax(au12)].t - seg.t0) / 1000 : 0 } },
      { id: "brows", name: COMPONENT_NAMES.brows, value: c.brows, info: { mean: weightedMean(brow, w) } },
      { id: "asym", name: COMPONENT_NAMES.asym, value: c.asym, info: { peakAt: frames.length ? (frames[asymIdx].t - seg.t0) / 1000 : 0, side: frames.length ? asymSide(frames[asymIdx]) : "" } },
      { id: "micro", name: COMPONENT_NAMES.micro, value: c.micro, info: { count: seg.micro.length, firstAt: seg.micro.length ? (seg.micro[0].t - seg.t0) / 1000 : 0 } },
      { id: "freeze", name: COMPONENT_NAMES.freeze, value: c.freeze, info: { still: weightedMean(frames.map((f) => f.still), w), baseline: stats.stillMean } },
    ];
    const captionFor = (d: ComponentDetail): string => {
      switch (d.id) {
        case "blink": return `Held eyes open ${blinkRatio.toFixed(1)}× longer than usual`;
        case "leak12": return au6Part >= au12Part ? "Cheeks lifted (a smile leaking through)" : `Lip corners pulled up at ${at(argmax(au12))}`;
        case "brows": return "Brows rose while saying it";
        case "asym": return asymCaption(frames[asymIdx], at(asymIdx));
        case "micro": return `A brief expression flashed at ${((seg.micro[0].t - seg.t0) / 1000).toFixed(1)} s`;
        case "freeze": return "Went very still";
      }
    };
    const ranked = details.filter((d) => d.value > p.display.captionMin && p.weights[d.id] > 0).sort((a, b) => b.value - a.value);
    const captions = ranked.slice(0, p.display.maxCaptions).map(captionFor);
    const chips: string[] = [];
    if (c.blink > p.display.captionMin) chips.push(`Eyes open ${longest.toFixed(1)} s`);
    if (seg.micro.length) chips.push(seg.micro.length === 1 ? "1 brief expression" : `${seg.micro.length} brief expressions`);
    const replayCaption = peak.quiet ? "Nothing much leaked." : captions.find((_, i) => ranked[i].id !== "blink") ?? captions[0] ?? "Something moved here.";

    return { id: seg.id, status: "scored", score, raw, components: c, details, intensity, peak, captions, replayCaption, chips, faceSec, qualityMean, baseline: stats };
  }

  /**
   * Per-frame tell intensity: a weighted mix of the smile, asymmetry and brow
   * excess over the baseline's P90, smoothed with tauMs, plus a step on each
   * brief expression that decays over microDecayMs. Blink suppression has no
   * per-frame form and is shown as a chip instead.
   */
  intensitySeries(seg: Segment, stats: BaselineStats): number[] {
    const p = this.p;
    const out = new Array<number>(seg.frames.length).fill(0);
    let s = 0;
    let lastT: number | null = null;
    for (let i = 0; i < seg.frames.length; i++) {
      const f = seg.frames[i];
      if (!f.face) {
        out[i] = 0;
        continue;
      }
      const leak = clamp01((Math.max(0, channel(f, "AU12") - stats.p90.AU12) + p.au6Weight * Math.max(0, channel(f, "AU6") - stats.p90.AU6)) / p.leakScale);
      const asym = clamp01(Math.max(0, channel(f, ASYM) - stats.p90[ASYM]) / p.asymScale);
      const brow = clamp01(Math.max(0, channel(f, BROWS) - stats.p90[BROWS]) / p.leakScale);
      const raw = clamp01(p.intensity.leak * leak + p.intensity.asym * asym + p.intensity.brow * brow);
      const dt = lastT === null ? 0 : (f.t - lastT) / 1000;
      lastT = f.t;
      s += (raw - s) * (dt > 0 ? emaAlpha(dt, p.intensity.tauMs / 1000) : 1);
      let bump = 0;
      for (const m of seg.micro) if (f.t >= m.t) bump = Math.max(bump, p.intensity.microStep * Math.max(0, 1 - (f.t - m.t) / p.intensity.microDecayMs));
      out[i] = clamp01(s + bump);
    }
    return out;
  }

  /** The peakWindowSec window with the highest mean intensity, or the middle of the statement when nothing cleared peakMin. */
  peakWindow(seg: Segment, intensity: number[]): PeakWindow {
    const p = this.p;
    const frames = seg.frames;
    const win = p.intensity.peakWindowSec * 1000;
    const t1 = seg.t1 ?? (frames.length ? frames[frames.length - 1].t : seg.t0);
    if (!frames.length) return { t0: seg.t0, t1: Math.min(t1, seg.t0 + win), mean: 0, quiet: true, from: 0, to: 0 };
    const maxI = Math.max(...intensity);
    const quiet = maxI <= p.intensity.peakMin;
    let bestFrom = 0;
    let bestTo = 0;
    let bestMean = -1;
    if (quiet) {
      const mid = seg.t0 + (t1 - seg.t0) / 2;
      const start = Math.max(seg.t0, mid - win / 2);
      bestFrom = frames.findIndex((f) => f.t >= start);
      if (bestFrom < 0) bestFrom = 0;
      bestTo = bestFrom;
      while (bestTo < frames.length && frames[bestTo].t < start + win) bestTo++;
      bestMean = 0;
    } else {
      let to = 0;
      for (let from = 0; from < frames.length; from++) {
        const start = frames[from].t;
        while (to < frames.length && frames[to].t < start + win) to++;
        let sum = 0;
        for (let i = from; i < to; i++) sum += intensity[i];
        const mean = sum / (to - from);
        if (mean > bestMean + 1e-9) {
          bestMean = mean;
          bestFrom = from;
          bestTo = to;
        }
        if (to >= frames.length && frames[frames.length - 1].t - start < win) break; // windows past this one are truncated copies
      }
    }
    const w0 = frames[bestFrom]?.t ?? seg.t0;
    return { t0: w0, t1: Math.min(w0 + win, t1), mean: Math.max(0, bestMean), quiet, from: bestFrom, to: Math.max(bestTo, bestFrom) };
  }
}

/** Which side moved more at this frame, by the strongest one-sided channel. "left" is the subject's left. */
export function asymSide(f: RecordedFrame): "left" | "right" | "" {
  const a = f.aus;
  const pairs: [number, string, string][] = [[a.AU12U ?? 0, "AU12L", "AU12R"], [a.AU14U ?? 0, "AU14L", "AU14R"], [a.AU2U ?? 0, "AU2L", "AU2R"]];
  pairs.sort((x, y) => y[0] - x[0]);
  const [, l, r] = pairs[0];
  if (a[l] === undefined || a[r] === undefined) return "";
  return a[l] >= a[r] ? "left" : "right";
}

function asymCaption(f: RecordedFrame, at: string): string {
  const a = f.aus;
  const u12 = a.AU12U ?? 0;
  const u14 = a.AU14U ?? 0;
  const u2 = a.AU2U ?? 0;
  const side = asymSide(f);
  const Side = side ? side[0].toUpperCase() + side.slice(1) + " " : "One ";
  if (u2 >= u12 && u2 >= u14) return side ? `${Side}brow rose on its own at ${at}` : `One brow rose on its own at ${at}`;
  if (u14 > u12) return side ? `${Side}cheek dimpled at ${at}` : `One cheek dimpled at ${at}`;
  return side ? `${Side}lip corner pulled at ${at}` : `One lip corner pulled at ${at}`;
}

// ------------------------------------------------------------------ Poker Face

export interface PokerFaceResult {
  /** 0–100, higher is better ("Straight-face 87"). */
  straightFace: number;
  /** Leakage 0–100 (100 − straightFace). */
  leakage: number;
  /** Time integral of the excess over the first seconds' P90 (AU·s). */
  integral: number;
  /** Per-bin integrals (AU·s). */
  bins: number[];
  /** Per-bin level 0–3 (none, small, medium, big). */
  levels: number[];
  /** Per-frame excess 0–1, for a live needle. */
  excess: number[];
  baselineFrames: number;
}

/**
 * Poker Face: leakage = time integral of the strongest excess among the
 * watched channels over the P90 of the first baselineSec seconds (minus a
 * margin), scaled so `scale` AU·seconds of leakage empties the score.
 */
export function scorePokerFace(frames: RecordedFrame[], p: TellParams["pokerface"], maxGapSec = 0.25): PokerFaceResult {
  const t0 = frames.length ? frames[0].t : 0;
  const base: Record<string, number[]> = {};
  for (const c of p.channels) base[c] = [];
  let baselineFrames = 0;
  for (const f of frames) {
    if (!f.face || f.t - t0 >= p.baselineSec * 1000) continue;
    baselineFrames++;
    for (const c of p.channels) base[c].push(channel(f, c));
  }
  const p90: Record<string, number> = {};
  for (const c of p.channels) p90[c] = quantile(base[c].sort((a, b) => a - b), 0.9);
  const w = frameWeights(frames, maxGapSec);
  const bins = new Array<number>(p.bins).fill(0);
  const excess = new Array<number>(frames.length).fill(0);
  let integral = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f.face) continue;
    let e = 0;
    for (const c of p.channels) e = Math.max(e, channel(f, c) - p90[c] - p.margin);
    e = clamp01(e);
    excess[i] = e;
    const leak = e * w[i];
    integral += leak;
    const b = Math.min(p.bins - 1, Math.max(0, Math.floor((f.t - t0) / (p.binSec * 1000))));
    bins[b] += leak;
  }
  const levels = bins.map((v) => (v >= p.binLevels[2] ? 3 : v >= p.binLevels[1] ? 2 : v >= p.binLevels[0] ? 1 : 0));
  const leakage = Math.round(100 * Math.min(1, integral / p.scale));
  return { straightFace: 100 - leakage, leakage, integral, bins, levels, excess, baselineFrames };
}
