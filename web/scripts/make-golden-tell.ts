/**
 * Replays every recorded session in model/fixtures/tell/*.json through the
 * engine, the SessionRecorder and the TellScorer, and writes the expected
 * scores to model/fixtures/tell/golden-tell.json. tests/tell-golden.test.ts
 * checks that the committed file matches the current scorer, and a later
 * Swift port must reproduce the same numbers.
 *
 *   npm run golden:tell     # regenerate after changing tell.json or tell.ts
 *
 * Fixture format (numbers only, no pixels): a sequences.json-style file
 *   { name, platform, about?, calibration?, gains?, frames: [{ t, m, cmd? }] }
 * with markers in `cmd`: "calibrate:3", "range:<step>", "baseline",
 * "statement:1" … "statement:3", "feed" (Poker Face), "end", "false:2" (which
 * statement was the false one). The developer recorder in the Mien app writes
 * exactly this format.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { EmotionEngine, type EmotionModel, type Platform } from "../src/engine/index.ts";
import { SessionRecorder, type Segment } from "../src/engine/recorder.ts";
import { scorePokerFace, TellScorer, validateTellParams, type TellParams, type TellResult } from "../src/engine/tell.ts";
import { estimateQuality } from "../src/app/quality.ts";
import type { SequenceFrame } from "./make-golden.ts";

const root = new URL("../../model/", import.meta.url);
export const FIXTURE_DIR = new URL("fixtures/tell/", root);
export const GOLDEN_FILE = new URL("golden-tell.json", FIXTURE_DIR);

export interface TellFixture {
  name: string;
  platform: Platform;
  about?: string;
  /** Calibrated neutral values restored before the replay (from the recorder's device). */
  calibration?: Record<string, number>;
  gains?: Record<string, number>;
  frames: SequenceFrame[];
}

export interface TellSession {
  baseline: Segment[];
  statements: Segment[];
  feeds: Segment[];
  /** Id of the statement marked false, if any. */
  label: string | null;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const r6map = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r6(v)]));

/** Runs the engine over a fixture and cuts the output into recorder segments by its markers. */
export function replayFixture(fx: TellFixture, model: EmotionModel, auIds?: string[]): TellSession {
  const engine = new EmotionEngine(model, fx.platform);
  if (fx.calibration) engine.baseline.setCalibration(fx.calibration);
  if (fx.gains) engine.baseline.setGains(fx.gains);
  const rec = new SessionRecorder(auIds);
  let label: string | null = null;
  let lastT = 0;
  for (const f of fx.frames) {
    lastT = f.t;
    const cmd = f.cmd;
    if (cmd) {
      const [op, arg] = cmd.split(":");
      if (op === "calibrate") engine.startCalibration(f.t, Number(arg));
      else if (op === "range") engine.startRangeStep(f.t, arg);
      else if (op === "baseline") rec.begin("baseline", "baseline", f.t);
      else if (op === "statement") rec.begin(`statement:${arg}`, "statement", f.t);
      else if (op === "feed") rec.begin("feed", "feed", f.t);
      else if (op === "end") { if (rec.current) rec.end(f.t); }
      else if (op === "false") label = `statement:${arg}`;
    }
    const out = engine.process(f.t, f.m);
    // Replays have no pixels: quality is the head-pose factor only.
    const q = out.face ? estimateQuality({ boxHeight: 1, yaw: out.pose.yaw, pitch: out.pose.pitch }) : null;
    rec.push(out, q ? { value: q.value, reason: q.reason } : { value: 0 });
  }
  if (rec.current) rec.end(lastT);
  const segs = rec.segments();
  return {
    baseline: segs.filter((s) => s.kind === "baseline"),
    statements: segs.filter((s) => s.kind === "statement"),
    feeds: segs.filter((s) => s.kind === "feed"),
    label,
  };
}

export function goldenResult(r: TellResult) {
  return {
    id: r.id,
    status: r.status,
    reason: r.reason ?? null,
    score: r.score,
    raw: r6(r.raw),
    components: r6map(r.components),
    captions: r.captions,
    chips: r.chips,
    replayCaption: r.replayCaption,
    peak: { t0: r6(r.peak.t0), t1: r6(r.peak.t1), mean: r6(r.peak.mean), quiet: r.peak.quiet },
    faceSec: r6(r.faceSec),
    qualityMean: r6(r.qualityMean),
    maxIntensity: r6(r.intensity.length ? Math.max(...r.intensity) : 0),
  };
}

export function scoreFixture(fx: TellFixture, model: EmotionModel, params: TellParams) {
  const session = replayFixture(fx, model, params.aus);
  const scorer = new TellScorer(params);
  scorer.setBaseline(...session.baseline);
  const stats = scorer.stats();
  const statements = scorer.scoreAll(session.statements).map(goldenResult);
  const meterPick = statements.filter((s) => s.status === "scored").sort((a, b) => b.score - a.score)[0]?.id ?? null;
  const pokerface = session.feeds.length
    ? session.feeds.map((f) => {
      const r = scorePokerFace(f.frames, params.pokerface, params.quality.maxGapSec);
      return { id: f.id, straightFace: r.straightFace, leakage: r.leakage, integral: r6(r.integral), levels: r.levels, bins: r.bins.map(r6), unscored: r.unscored };
    })
    : [];
  return {
    name: fx.name,
    platform: fx.platform,
    label: session.label,
    meterPick,
    baseline: {
      frames: stats.frames,
      faceSec: r6(stats.faceSec),
      blinks: stats.blinks,
      ibiMedianSec: r6(stats.ibiMedianSec),
      longestOpenSec: r6(stats.longestOpenSec),
      microPerMin: r6(stats.microPerMin),
      stillMean: r6(stats.stillMean),
      p50: r6map(stats.p50),
      p90: r6map(stats.p90),
    },
    statements,
    pokerface,
  };
}

export function listFixtures(): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith(".json") && n !== "golden-tell.json").sort();
  } catch {
    /* no fixtures yet */
  }
  return names;
}

export function makeGoldenTell() {
  const model = JSON.parse(readFileSync(new URL("emotion-model.json", root), "utf8")) as EmotionModel;
  const params = validateTellParams(JSON.parse(readFileSync(new URL("tell.json", root), "utf8")));
  const fixtures = listFixtures().map((n) => {
    const fx = JSON.parse(readFileSync(new URL(n, FIXTURE_DIR), "utf8")) as TellFixture;
    return { file: n, ...scoreFixture(fx, model, params) };
  });
  return {
    about: "Expected TellScorer outputs for model/fixtures/tell/*.json, generated by web/scripts/make-golden-tell.ts. Do not edit by hand.",
    modelVersion: model.version,
    tellVersion: params.version,
    fixtures,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const g = makeGoldenTell();
  writeFileSync(GOLDEN_FILE, JSON.stringify(g, null, 1) + "\n");
  console.log(`wrote model/fixtures/tell/golden-tell.json (${g.fixtures.length} fixtures)`);
  for (const f of g.fixtures) {
    console.log(`  ${f.name}: false=${f.label ?? "?"} meter=${f.meterPick ?? "-"} ` + f.statements.map((s) => `${s.id.replace("statement:", "#")}=${s.status === "scored" ? s.score : s.reason}`).join(" "));
  }
}
