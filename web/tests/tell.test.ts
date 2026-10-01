import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EmotionEngine } from "../src/engine/index.ts";
import { DEFAULT_TELL_AUS, SessionRecorder } from "../src/engine/recorder.ts";
import { COMPONENT_IDS, COMPONENT_NAMES, TellScorer, scorePokerFace, validateTellParams } from "../src/engine/tell.ts";
import { DevRecorder } from "../src/app/devrecorder.ts";
import { estimateQuality } from "../src/app/quality.ts";
import { FORBIDDEN_WORDS, findForbidden } from "./tell-words.ts";
import { arkitFace, model, PROTOTYPES } from "./helpers.ts";
import { synthSegment, tellParams } from "./tell-helpers.ts";

const scorer = () => new TellScorer(tellParams);
/** 12 s talking baseline: mouth moving, a blink every 3 s. */
const talking = (sec: number) => ({ AU25: 0.2 * Math.max(0, Math.sin(sec * 4)), AU26: 0.15 * Math.max(0, Math.sin(sec * 3)) });
const baseline = (seed = 1) => synthSegment("baseline", "baseline", 0, 12, { seed, blinkEverySec: 3, extra: talking });

describe("model/tell.json", () => {
  const raw = JSON.parse(readFileSync(new URL("../../model/tell.json", import.meta.url), "utf8"));

  it("has a semver version and validates", () => {
    expect(raw.version).toMatch(/^\d+\.\d+\.\d+$/);
    const p = validateTellParams(raw);
    expect(Object.keys(p.weights).sort()).toEqual([...COMPONENT_IDS].sort());
    expect(p.aus).toEqual([...DEFAULT_TELL_AUS]);
  });

  it("rejects malformed parameters", () => {
    const bad = (mutate: (p: Record<string, unknown>) => void) => {
      const copy = structuredClone(raw);
      mutate(copy);
      return () => validateTellParams(copy);
    };
    expect(bad((p) => { p.version = "1"; })).toThrow(/version/);
    expect(bad((p) => { (p.weights as Record<string, number>).blink = -1; })).toThrow(/weights/);
    expect(bad((p) => { (p.weights as Record<string, number>).gaze = 0.1; })).toThrow(/unknown weight/);
    expect(bad((p) => { p.leakScale = 0; })).toThrow(/positive/);
    expect(bad((p) => { (p.blink as Record<string, number>).hi = 0.5; })).toThrow(/blink.hi/);
    expect(bad((p) => { delete (p.pokerface as Record<string, unknown>).binLevels; })).toThrow(/binLevels/);
  });
});

describe("TellScorer on synthetic segments", () => {
  it("(a) a statement identical to the baseline scores under 10", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const st = synthSegment("s1", "statement", 20_000, 8, { seed: 7, blinkEverySec: 3, extra: talking });
    const r = s.score(st);
    expect(r.status).toBe("scored");
    expect(r.score).toBeLessThan(10);
    expect(r.components.blink).toBeLessThan(0.2);
    expect(r.captions).toEqual([]);
  });

  it("(b) no blinks for 8 s against a baseline IBI of 3 s gives blink >= 0.8", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    expect(s.stats().ibiMedianSec).toBeCloseTo(3, 1);
    const st = synthSegment("s2", "statement", 20_000, 8, { seed: 8, blinkEverySec: 0, extra: talking });
    const r = s.score(st);
    expect(r.components.blink).toBeGreaterThanOrEqual(0.8);
    expect(r.captions[0]).toMatch(/^Held eyes open [\d.]+× longer than usual$/);
    expect(r.chips).toContain("Eyes open 8.0 s");
    expect(r.score).toBeGreaterThan(30);
  });

  it("(c) AU12 0.3 over the baseline for half the statement gives leak12 ≈ 0.5", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const st = synthSegment("s3", "statement", 20_000, 8, {
      seed: 9, blinkEverySec: 3,
      extra: (sec) => ({ ...talking(sec), ...(sec >= 4 ? { AU12: 0.3, AU12L: 0.3, AU12R: 0.3 } : {}) }),
    });
    const r = s.score(st);
    expect(r.components.leak12).toBeGreaterThan(0.4);
    expect(r.components.leak12).toBeLessThan(0.6);
    expect(r.captions.some((c) => /^Lip corners pulled up at [\d.]+ s$/.test(c))).toBe(true);
    // The peak window sits inside the leaking half.
    expect(r.peak.quiet).toBe(false);
    expect(r.peak.t0).toBeGreaterThanOrEqual(20_000 + 3500);
    expect(r.peak.t1 - r.peak.t0).toBeCloseTo(3000, -2);
    expect(Math.max(...r.intensity)).toBeGreaterThan(0.3);
  });

  it("(d) a short, dark or lost statement is unscored with a reason", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    expect(s.score(synthSegment("short", "statement", 20_000, 2, { seed: 2 }))).toMatchObject({ status: "unscored", reason: "too short", score: 0 });
    expect(s.score(synthSegment("dark", "statement", 20_000, 8, { seed: 2, quality: 0.3, qualityReason: "light" }))).toMatchObject({ status: "unscored", reason: "too dark" });
    expect(s.score(synthSegment("far", "statement", 20_000, 8, { seed: 2, quality: 0.2, qualityReason: "size" }))).toMatchObject({ status: "unscored", reason: "face out of frame" });
    expect(s.score(synthSegment("lost", "statement", 20_000, 8, { seed: 2, faceLost: [[0, 6]] }))).toMatchObject({ status: "unscored", reason: "face out of frame" });
    const quiet = s.score(synthSegment("short", "statement", 20_000, 2, { seed: 2 }));
    expect(quiet.replayCaption).toBe("Not scored: too short.");
  });

  it("(e) captions, names and chips never use forbidden words", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const scenarios = [
      synthSegment("blink", "statement", 20_000, 10, { seed: 3, blinkEverySec: 0, extra: talking }),
      synthSegment("smile", "statement", 20_000, 8, { seed: 4, blinkEverySec: 3, extra: (sec) => ({ AU12: 0.4, AU12L: 0.4, AU12R: 0.4, ...talking(sec) }) }),
      synthSegment("cheeks", "statement", 20_000, 8, { seed: 4, blinkEverySec: 3, extra: () => ({ AU6: 0.5 }) }),
      synthSegment("brows", "statement", 20_000, 8, { seed: 5, blinkEverySec: 3, extra: () => ({ AU1: 0.4, AU2: 0.4 }) }),
      synthSegment("asymL", "statement", 20_000, 8, { seed: 6, blinkEverySec: 3, extra: () => ({ AU12U: 0.4, AU12L: 0.5 }) }),
      synthSegment("asymR", "statement", 20_000, 8, { seed: 6, blinkEverySec: 3, extra: () => ({ AU14U: 0.4, AU14R: 0.5 }) }),
      synthSegment("asymBrow", "statement", 20_000, 8, { seed: 6, blinkEverySec: 3, extra: () => ({ AU2U: 0.4, AU2R: 0.5 }) }),
      synthSegment("micro", "statement", 20_000, 8, { seed: 7, blinkEverySec: 3, micro: [{ at: 2.3, id: "surprise" }, { at: 5, id: "fear" }] }),
      synthSegment("still", "statement", 20_000, 8, { seed: 8, blinkEverySec: 3, still: 1 }),
      synthSegment("everything", "statement", 20_000, 10, { seed: 9, blinkEverySec: 0, still: 1, micro: [{ at: 1, id: "anger" }], extra: () => ({ AU12: 0.4, AU6: 0.3, AU1: 0.4, AU2: 0.4, AU12U: 0.4, AU12L: 0.5 }) }),
      synthSegment("quiet", "statement", 20_000, 8, { seed: 10, blinkEverySec: 3, extra: talking }),
    ];
    const texts: string[] = Object.values(COMPONENT_NAMES);
    let captioned = 0;
    for (const st of scenarios) {
      const r = s.score(st);
      texts.push(...r.captions, ...r.chips, r.replayCaption);
      captioned += r.captions.length;
      for (const d of r.details) texts.push(d.name);
    }
    expect(captioned).toBeGreaterThan(8);
    for (const t of texts) expect(findForbidden(t), t).toEqual([]);
    expect(FORBIDDEN_WORDS.length).toBeGreaterThan(10);
  });

  it("names the side of a one-sided movement from the subject's point of view", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const left = s.score(synthSegment("asymL", "statement", 20_000, 8, { seed: 6, blinkEverySec: 3, extra: () => ({ AU12U: 0.4, AU12L: 0.5 }) }));
    expect(left.captions).toContain(left.captions.find((c) => c.startsWith("Left lip corner pulled at ")));
    const right = s.score(synthSegment("asymR", "statement", 20_000, 8, { seed: 6, blinkEverySec: 3, extra: () => ({ AU14U: 0.4, AU14R: 0.5 }) }));
    expect(right.captions.some((c) => c.startsWith("Right cheek dimpled at "))).toBe(true);
  });

  it("marks a quiet statement's replay as the middle 3 s with 'Nothing much leaked.'", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const r = s.score(synthSegment("quiet", "statement", 20_000, 9, { seed: 11, blinkEverySec: 3, extra: talking }));
    expect(r.peak.quiet).toBe(true);
    expect(r.replayCaption).toBe("Nothing much leaked.");
    expect(r.peak.t0).toBeCloseTo(20_000 + 3000, -2);
  });

  it("brief expressions bump the intensity and count towards the score", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const r = s.score(synthSegment("micro", "statement", 20_000, 8, { seed: 7, blinkEverySec: 3, extra: talking, micro: [{ at: 2.3, id: "surprise" }] }));
    expect(r.components.micro).toBe(1);
    const i = r.intensity;
    const k = Math.round(2.3 * 30);
    expect(i[k]).toBeGreaterThan(0.25);
    expect(i[k + 15]).toBeLessThan(i[k]);
    expect(i[k + 40]).toBeLessThan(0.05);
    expect(r.captions).toContain("A brief expression flashed at 2.3 s");
    expect(r.chips).toContain("1 brief expression");
  });

  it("grows the baseline with the other statements when baseline.grow is on (leave-one-out)", () => {
    const s = scorer();
    s.setBaseline(baseline(1));
    const stare = synthSegment("s1", "statement", 20_000, 10, { seed: 3, blinkEverySec: 0, extra: talking });
    const normal2 = synthSegment("s2", "statement", 40_000, 8, { seed: 4, blinkEverySec: 3, extra: talking });
    const normal3 = synthSegment("s3", "statement", 60_000, 8, { seed: 5, blinkEverySec: 3, extra: talking });
    const all = s.scoreAll([stare, normal2, normal3]);
    expect(all[0].score).toBeGreaterThan(all[1].score);
    expect(all[0].score).toBeGreaterThan(all[2].score);
    // Normal statements were compared against a baseline that includes the stare.
    expect(all[1].baseline.longestOpenSec).toBeGreaterThanOrEqual(10);
    expect(all[0].baseline.longestOpenSec).toBeLessThan(10);
    expect(all[1].score).toBeLessThan(10);
  });

  it("the display curve lifts small real deviations and keeps 0 and 100 fixed", () => {
    const p = tellParams.display.curve;
    expect(Math.pow(0, p)).toBe(0);
    expect(Math.pow(1, p)).toBe(1);
    expect(Math.pow(0.2, p)).toBeGreaterThan(0.2);
  });
});

describe("SessionRecorder with the engine", () => {
  it("records AUs, pose, stillness, blinks and brief expressions per segment, numbers only", () => {
    const e = new EmotionEngine(model, "arkit");
    const rec = new SessionRecorder();
    const dt = 1000 / 30;
    let t = 0;
    const feed = (ms: number, face: (sec: number) => Record<string, number> | null) => {
      const end = t + ms;
      for (; t < end; t += dt) rec.push(e.process(t, face((t - (end - ms)) / 1000)), { value: 0.9, reason: "light" });
    };
    e.startCalibration(0, 1);
    feed(1200, () => arkitFace({}));
    rec.begin("baseline", "baseline", t);
    // Blink every 2 s (120 ms closures), otherwise resting.
    feed(8000, (sec) => arkitFace(sec % 2 < 0.12 ? { "eyeBlink{S}": 0.9 } : {}));
    const base = rec.end(t);
    rec.begin("s1", "statement", t);
    feed(2000, () => arkitFace({}));
    feed(300, () => arkitFace(PROTOTYPES.surprise)); // a brief flash
    feed(2000, () => arkitFace({}));
    feed(1000, () => null); // face lost
    feed(2000, () => arkitFace({ "mouthSmile{S}": 0.8, "cheekSquint{S}": 0.5 }));
    const s1 = rec.end(t);

    expect(rec.segments().map((s) => s.id)).toEqual(["baseline", "s1"]);
    expect(base.blinks.length).toBeGreaterThanOrEqual(3);
    expect(base.frames.length).toBeGreaterThanOrEqual(240);
    expect(base.frames.length).toBeLessThanOrEqual(241);
    expect(base.frames[10].quality).toBe(0.9);
    expect(base.frames[10].qualityReason).toBe("light");
    expect(Object.keys(base.frames[10].aus).sort()).toEqual([...DEFAULT_TELL_AUS].sort());
    expect(s1.micro.map((m) => m.id)).toContain("surprise");
    expect(s1.frames.some((f) => !f.face)).toBe(true);
    const lost = s1.frames.find((f) => !f.face)!;
    expect(lost.aus).toEqual({});
    expect(lost.quality).toBe(0);
    expect(Math.max(...s1.frames.map((f) => f.aus.AU12 ?? 0))).toBeGreaterThan(0.5);
    expect(Math.max(...s1.frames.map((f) => f.aus.STILL ?? 0))).toBeGreaterThan(0.5);

    const dump = JSON.stringify(rec.toJSON());
    expect(dump).not.toMatch(/mouthSmile|browInnerUp|geo\.|tex\./);
    const back = SessionRecorder.fromJSON(JSON.parse(dump));
    expect(back.segments()[1].micro).toEqual(s1.micro);
    expect(back.segments()[0].frames.length).toBe(base.frames.length);

    // The scorer runs on the recorded segments.
    const s = new TellScorer(tellParams);
    s.setBaseline(base);
    const r = s.score(s1);
    expect(r.status).toBe("scored");
    expect(r.components.leak12).toBeGreaterThan(0.1);
    expect(r.components.micro).toBe(1);
    expect(r.score).toBeGreaterThan(10);
  });

  it("begin() closes an open segment, end() without one throws, clear() forgets", () => {
    const rec = new SessionRecorder(["AU12"]);
    rec.begin("a", "baseline", 0);
    rec.begin("b", "statement", 100);
    expect(rec.segments().map((s) => [s.id, s.t1])).toEqual([["a", 100]]);
    expect(rec.current?.id).toBe("b");
    rec.end(200);
    expect(() => rec.end(300)).toThrow();
    rec.clear();
    expect(rec.segments()).toEqual([]);
  });
});

describe("Poker Face scoring", () => {
  it("gives a straight face 100 and a leaking face less, with the leak in the right bins", () => {
    const flat = synthSegment("feed", "feed", 0, 60, { seed: 1, noise: 0.02, blinkEverySec: 4 });
    const a = scorePokerFace(flat.frames, tellParams.pokerface);
    expect(a.straightFace).toBeGreaterThanOrEqual(95);
    expect(a.levels).toHaveLength(10);
    expect(a.baselineFrames).toBe(150);
    const leaky = synthSegment("feed", "feed", 0, 60, {
      seed: 1, noise: 0.02, blinkEverySec: 4,
      extra: (sec): Record<string, number> => (sec >= 20 && sec < 28 ? { AU12: 0.6, AU6: 0.3 } : sec >= 45 && sec < 46 ? { AU1: 0.3, AU2: 0.3 } : {}),
    });
    const b = scorePokerFace(leaky.frames, tellParams.pokerface);
    expect(b.straightFace).toBeLessThan(a.straightFace);
    expect(b.straightFace).toBeGreaterThan(0);
    expect(b.levels[3]).toBeGreaterThanOrEqual(2);
    expect(b.levels[4]).toBeGreaterThanOrEqual(2);
    expect(b.levels[7]).toBeGreaterThanOrEqual(1);
    expect(b.levels[0]).toBe(0);
    expect(b.levels[9]).toBe(0);
    expect(Math.max(...b.excess)).toBeGreaterThan(0.4);
    expect(a.unscored).toBeUndefined();
    expect(b.unscored).toBeUndefined();
  });

  it("is unscored when the face is missing from the baseline or from most of the feed", () => {
    const noBaseline = synthSegment("feed", "feed", 0, 60, { seed: 2, faceLost: [[0, 4]] });
    expect(scorePokerFace(noBaseline.frames, tellParams.pokerface).unscored).toBe("baseline");
    const hidden = synthSegment("feed", "feed", 0, 60, { seed: 2, faceLost: [[8, 60]] });
    const h = scorePokerFace(hidden.frames, tellParams.pokerface);
    expect(h.unscored).toBe("face");
    expect(h.faceSec).toBeLessThan(10);
    expect(scorePokerFace([], tellParams.pokerface).unscored).toBe("baseline");
    // A short gap is fine.
    const blip = synthSegment("feed", "feed", 0, 60, { seed: 2, faceLost: [[20, 22]] });
    expect(scorePokerFace(blip.frames, tellParams.pokerface).unscored).toBeUndefined();
  });
});

describe("developer recorder", () => {
  it("keeps markers tapped between two frames in the order they were tapped", () => {
    const r = new DevRecorder();
    r.push(1000, { a: 1 });
    r.mark("end");
    r.nextStatement();
    r.push(1033, { a: 1 });
    r.push(1066, null);
    expect(r.toJSON("x").frames.map((f) => [f.t, f.cmd])).toEqual([[0, undefined], [33, "end"], [33, "statement:1"], [66, undefined]]);
    expect(r.frameCount).toBe(4);
  });
});

describe("tracking quality", () => {
  it("is the minimum of size, light and pose with a matching hint", () => {
    expect(estimateQuality({ boxHeight: 0.4, luminance: 120, yaw: 0, pitch: 0 }).value).toBe(1);
    const far = estimateQuality({ boxHeight: 0.14, luminance: 120, yaw: 0, pitch: 0 });
    expect(far.reason).toBe("size");
    expect(far.hint).toBe("Come closer");
    const dark = estimateQuality({ boxHeight: 0.4, luminance: 45, yaw: 0, pitch: 0 });
    expect(dark.reason).toBe("light");
    expect(dark.hint).toBe("Move to the light");
    const turned = estimateQuality({ boxHeight: 0.4, luminance: 120, yaw: 32, pitch: 0 });
    expect(turned.reason).toBe("pose");
    expect(turned.hint).toBe("Face the phone");
    expect(estimateQuality({ boxHeight: 0.4, luminance: 120, yaw: 40, pitch: 0 }).value).toBe(0);
    expect(estimateQuality({ boxHeight: 0.4, yaw: 10, pitch: 10 }).value).toBe(1); // luminance unknown counts as fine
    const okish = estimateQuality({ boxHeight: 0.2, luminance: 70, yaw: 0, pitch: 0 });
    expect(okish.value).toBeGreaterThan(0.5);
    expect(okish.hint).toBe("");
  });
});
