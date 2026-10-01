import { QUALITY_PARAMS } from "../../app/quality.ts";
import { load, save } from "../../app/storage.ts";
import { TELL_PARAMS } from "../../app/tellModel.ts";
import { channel, quantile, scorePokerFace, type PokerFaceResult } from "../../engine/tell.ts";
import type { App, Screen } from "../app.ts";
import { pokerDayNumber, TIMING } from "../config.ts";
import { meshFaceCard } from "../components/meshface.ts";
import { shareText } from "../components/share.ts";
import decks from "../content/decks.json";
import { h, svgRing } from "../dom.ts";
import type { Frame } from "../rig.ts";
import { rng } from "./seed.ts";

interface Streak { last: number; count: number; best: number }
interface DayResult { straightFace: number; levels: number[]; playedAt: string }

const CELLS = ["⬛", "🟨", "🟧", "🟥"];
/** The live needle needs this many baseline frames before it compares anything. */
const MIN_BASELINE_FRAMES = 5;

export function shareCard(day: number, r: { straightFace: number; levels: number[] }, streak: number): string {
  return `TELL Poker Face #${day}  ${r.straightFace}/100 🔥 ${streak}\n${r.levels.map((l) => CELLS[l]).join("")}`;
}

/** Streak update for a finished daily: consecutive days played. */
export function bumpStreak(s: Streak | null, day: number): Streak {
  if (!s) return { last: day, count: 1, best: 1 };
  if (s.last === day) return s;
  const count = s.last === day - 1 ? s.count + 1 : 1;
  return { last: day, count, best: Math.max(s.best, count) };
}

type Provocation = { kind: "line"; text: string } | { kind: "emoji"; text: string } | { kind: "face"; id: string };

/** The day's provocation list, in a seeded order so everyone gets the same feed. */
export function dailyFeed(seed: number): Provocation[] {
  const rnd = rng(seed + 1);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const out: Provocation[] = [];
  const kinds: Provocation["kind"][] = ["line", "face", "emoji", "line", "face", "emoji", "line", "face", "line", "emoji", "face", "line", "face", "emoji"];
  for (const kind of kinds) {
    if (kind === "line") out.push({ kind, text: pick(decks.pokerface.lines) });
    else if (kind === "emoji") out.push({ kind, text: pick(decks.pokerface.emoji) });
    else out.push({ kind, id: pick(decks.pokerface.faces) });
  }
  return out;
}

export function pokerface(app: App): Screen {
  const rig = app.rig;
  const day = pokerDayNumber();
  const pf = { ...TELL_PARAMS.pokerface, baselineSec: TIMING.pokerBaselineSec, binSec: TIMING.pokerBinSec };
  let streak = load<Streak | null>("tell.streak", null);
  const played = load<DayResult | null>(`tell.poker.${day}`, null);
  let state: "intro" | "running" | "done" = "intro";
  let t0 = 0;
  let lastQualityOk = false;
  let nextProvocationAt = 0;
  let feedIndex = 0;
  const feed = dailyFeed(day);
  const base: Record<string, number[]> = {};
  let p90: Record<string, number> | null = null;
  let audio: AudioContext | null = null;
  let result: PokerFaceResult | null = null;

  const title = h("h2", { class: "cam-title" }, `Poker Face #${day}`);
  const prompt = h("p", { class: "cam-prompt" }, played ? `Today: straight-face ${played.straightFace}. Play again to beat it.` : `Keep a straight face for ${TIMING.pokerSec} seconds while the phone tries to break it.`);
  const hint = h("p", { class: "cam-hint" }, streak ? `🔥 ${streak.count}-day streak` : "");
  const button = h("button", { class: "primary-btn cam-btn", disabled: true, "data-testid": "cam-btn", onclick: start }, "Loading…");
  const ring = svgRing("cam-arc", 140);
  const stageBox = h("div", { class: "provocation", hidden: true });
  const needle = h("div", { class: "needle" }, h("span", { class: "needle-fill" }));
  const panel = h("div", { class: "cam-panel" }, h("p", { class: "eyebrow" }, "Solo daily"), title, prompt, stageBox, h("div", { class: "ringbtn" }, ring, button), needle, hint);
  const back = h("button", { class: "text-btn", onclick: () => { app.rig.stop(); app.go("home"); } }, "Back");
  const el = h("div", { class: "screen cam poker" }, panel, back);

  function start(): void {
    if (state !== "intro" || !lastQualityOk) return;
    state = "running";
    t0 = performance.now();
    app.recorder.clear();
    app.recorder.begin("feed", "feed", t0);
    for (const c of pf.channels) base[c] = [];
    p90 = null;
    feedIndex = 0;
    nextProvocationAt = pf.baselineSec * 1000;
    button.textContent = "Straight face…";
    button.classList.add("recording");
    button.disabled = true;
    prompt.textContent = "Eyes on the phone. Don't move a muscle.";
    hint.textContent = "";
    try {
      audio = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      audio = null;
    }
  }

  function blip(): void {
    if (!audio) return;
    try {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(660, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(220, audio.currentTime + 0.18);
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.3);
    } catch {
      /* no sound */
    }
  }

  function provoke(elapsedMs: number): void {
    const p = feed[feedIndex % feed.length];
    feedIndex++;
    stageBox.hidden = false;
    if (p.kind === "line") stageBox.replaceChildren(h("p", { class: "prov-line" }, p.text));
    else if (p.kind === "emoji") { stageBox.replaceChildren(h("p", { class: "prov-emoji" }, p.text)); blip(); }
    else stageBox.replaceChildren(meshFaceCard(p.id));
    const gap = TIMING.pokerProvocationMinSec + Math.random() * (TIMING.pokerProvocationMaxSec - TIMING.pokerProvocationMinSec);
    nextProvocationAt = elapsedMs + gap * 1000;
  }

  function onFrame(f: Frame): void {
    const q = f.quality;
    lastQualityOk = !!f.face && q.value >= QUALITY_PARAMS.minimum;
    if (!f.face) app.badge(rig.faceLostMs(f.out.t) > TIMING.faceLostMs ? "Where did you go?" : "Looking for your face…");
    else if (q.hint) app.badge(q.hint);
    else app.badge("");
    if (state === "intro") {
      button.disabled = !lastQualityOk;
      button.textContent = lastQualityOk ? "Tap to start" : f.face ? q.hint : "Where did you go?";
      return;
    }
    if (state !== "running") return;
    app.recorder.push(f.out, { value: q.value, reason: q.reason });
    const elapsed = f.out.t - t0;
    (ring.lastElementChild as SVGElement).style.strokeDashoffset = String(276.46 * (1 - Math.min(1, elapsed / (TIMING.pokerSec * 1000))));
    // Live needle: excess over the first seconds' P90, same formula as the scorer.
    if (f.face) {
      const frame = app.recorder.current!.frames[app.recorder.current!.frames.length - 1];
      if (elapsed < pf.baselineSec * 1000) {
        for (const c of pf.channels) base[c].push(channel(frame, c));
      } else if (p90 || base[pf.channels[0]].length >= MIN_BASELINE_FRAMES) {
        p90 ??= Object.fromEntries(pf.channels.map((c) => [c, quantile(base[c].sort((a, b) => a - b), 0.9)]));
        let e = 0;
        for (const c of pf.channels) e = Math.max(e, channel(frame, c) - p90[c] - pf.margin);
        (needle.firstElementChild as HTMLElement).style.width = `${Math.min(100, Math.max(0, e) * 100)}%`;
      }
    }
    if (elapsed >= nextProvocationAt && elapsed < TIMING.pokerSec * 1000 - 500) provoke(elapsed);
    if (elapsed >= TIMING.pokerSec * 1000) finish(f.out.t);
  }

  function finish(t: number): void {
    state = "done";
    const seg = app.recorder.end(t);
    result = scorePokerFace(seg.frames, pf, TELL_PARAMS.quality.maxGapSec);
    rig.active = false;
    if (result.unscored) {
      // No face in the baseline or in most of the feed: nothing to compare with, so no score, no best, no streak.
      el.replaceChildren(
        h("div", { class: "screen pf-result" },
          h("p", { class: "eyebrow" }, `Poker Face #${day}`),
          h("h1", { class: "big", "data-testid": "pf-unscored" }, "No score this time"),
          h("p", { class: "lede" }, result.unscored === "baseline"
            ? `The phone couldn't see your face during the first ${pf.baselineSec} seconds, so there was nothing to compare with.`
            : "Your face was out of view for too much of the minute to score it."),
          h("div", { class: "actions" },
            h("button", { class: "primary-btn", onclick: () => app.go("pokerface") }, "Try again"),
            h("button", { class: "text-btn", onclick: () => { app.rig.stop(); app.go("home"); } }, "Home"),
          ),
        ),
      );
      return;
    }
    const prev = played;
    const best = prev && prev.straightFace > result.straightFace ? prev : { straightFace: result.straightFace, levels: result.levels, playedAt: new Date().toISOString() };
    save(`tell.poker.${day}`, best);
    streak = bumpStreak(streak, day);
    save("tell.streak", streak);
    const card = shareCard(day, result, streak.count);
    const grid = h("div", { class: "pf-grid", "data-testid": "pf-grid" }, ...result.levels.map((l, i) => h("span", { class: `cell l${l}`, title: `${i * pf.binSec}–${(i + 1) * pf.binSec} s` }, CELLS[l])));
    el.replaceChildren(
      h("div", { class: "screen pf-result" },
        h("p", { class: "eyebrow" }, `Poker Face #${day}`),
        h("h1", { class: "big", "data-testid": "pf-score" }, `Straight-face ${result.straightFace}`),
        h("p", { class: "lede" }, result.straightFace >= 90 ? "Barely a flicker." : result.straightFace >= 60 ? "Something got through." : "Your face had opinions."),
        grid,
        h("p", { class: "fine" }, `Ten ${pf.binSec}-second bins: ⬛ nothing, 🟨 small, 🟧 medium, 🟥 big movement away from your first ${pf.baselineSec} seconds.`),
        h("p", { class: "streak" }, `🔥 ${streak.count}-day streak${streak.best > streak.count ? ` · best ${streak.best}` : ""}`),
        h("pre", { class: "share-preview", "data-testid": "pf-share" }, card),
        h("div", { class: "actions" },
          h("button", { class: "primary-btn", onclick: async () => { const how = await shareText(card, "TELL Poker Face"); app.toast(how === "copied" ? "Copied to the clipboard." : how === "failed" ? "Couldn't share." : "Shared."); } }, "Share"),
          h("button", { class: "secondary-btn", onclick: () => app.go("pokerface") }, "Play again"),
          h("button", { class: "text-btn", onclick: () => { app.rig.stop(); app.go("home"); } }, "Home"),
        ),
      ),
    );
  }

  const off = rig.onFrame(onFrame);
  app.ensureCamera().then((ok) => {
    if (!ok) app.go("home");
  });

  return {
    el,
    camera: true,
    destroy() {
      off();
      if (app.recorder.current) app.recorder.end(performance.now());
      audio?.close().catch(() => undefined);
    },
  };
}
