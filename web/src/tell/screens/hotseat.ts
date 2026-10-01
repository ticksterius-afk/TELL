import { hasSavedCalibration, NeutralCalibration, setRing } from "../../app/calibration.ts";
import { QUALITY_PARAMS } from "../../app/quality.ts";
import type { App, Screen } from "../app.ts";
import { TIMING } from "../config.ts";
import decks from "../content/decks.json";
import { h, svgRing } from "../dom.ts";
import type { Frame } from "../rig.ts";
import type { MeshFrame } from "../state.ts";

type Step = "loading" | "calibrate" | "baseline" | "statement";

interface Recording {
  kind: "calibrate" | "baseline" | "statement";
  t0: number;
  /** Planned length in ms (statements: the maximum). */
  lengthMs: number;
  /** Earliest manual stop. */
  minMs: number;
  mesh: MeshFrame[];
  pausedAt: number | null;
  pausedMs: number;
}

/**
 * The hot seat: calibrate (or confirm a saved calibration), a talking
 * baseline, then three statements. The hot-seat player sees only the ring and
 * the quality badge, never a meter.
 */
export function hotseat(app: App): Screen {
  const round = app.round!;
  const turn = round.current!;
  const player = round.players[turn.hotSeat];
  const rig = app.rig;
  const cal = new NeutralCalibration(rig.engine);
  let step: Step = "loading";
  let n = 1;
  let rec: Recording | null = null;
  let lastQualityOk = false;

  const title = h("h2", { class: "cam-title" }, "Loading face model…");
  const prompt = h("p", { class: "cam-prompt" }, "");
  const hint = h("p", { class: "cam-hint" }, "");
  const button = h("button", { class: "primary-btn cam-btn", disabled: true, "data-testid": "cam-btn" }, "…");
  const alt = h("button", { class: "text-btn", hidden: true }, "");
  const ideas = h("button", { class: "text-btn", hidden: true, onclick: showIdeas }, "Need ideas?");
  const cards = h("div", { class: "idea-cards", hidden: true });
  const ring = svgRing("cam-arc", 140);
  const panel = h("div", { class: "cam-panel" },
    h("p", { class: "eyebrow" }, player.name),
    title, prompt, cards,
    h("div", { class: "ringbtn" }, ring, button),
    hint, ideas, alt,
  );
  const el = h("div", { class: "screen cam" }, panel);

  button.addEventListener("click", onButton);

  function showIdeas(): void {
    const pool = [...decks.ideas];
    const picks: string[] = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    cards.replaceChildren(...picks.map((p) => h("button", { class: "idea", onclick: () => { prompt.textContent = `"${p}" — or anything you like. Tap, say it, tap.`; cards.hidden = true; } }, p)));
    cards.hidden = !cards.hidden;
  }

  function setStep(s: Step): void {
    step = s;
    cards.hidden = true;
    ideas.hidden = s !== "statement";
    alt.hidden = true;
    setRing(ring.lastElementChild, 0);
    if (s === "calibrate") {
      if (hasSavedCalibration() && rig.engine.baseline.calibrated) {
        title.textContent = `Is this you, ${player.name}?`;
        prompt.textContent = "A neutral-face calibration from earlier is saved on this phone. If it's yours, skip ahead.";
        button.textContent = "That's me";
        alt.textContent = "Calibrate again";
        alt.hidden = false;
        alt.onclick = () => { title.textContent = "Look at the phone and relax your face"; prompt.textContent = "Three seconds, lips together, brows relaxed."; button.textContent = "Calibrate"; alt.hidden = true; mode = "calibrate"; };
        mode = "confirm";
      } else {
        title.textContent = "Look at the phone and relax your face";
        prompt.textContent = "Three seconds, lips together, brows relaxed. Everything after this is measured from your own baseline.";
        button.textContent = "Calibrate";
        mode = "calibrate";
      }
    } else if (s === "baseline") {
      title.textContent = "Baseline";
      prompt.textContent = `Tell us your name and what you had for breakfast. Keep talking for ${TIMING.baselineSec} seconds.`;
      button.textContent = "Tap, then talk";
      mode = "baseline";
    } else if (s === "statement") {
      title.textContent = `Statement ${n} of 3`;
      prompt.textContent = n === 1 ? "Three things about you, one of them false. Tap, say it, tap." : "Tap, say it, tap.";
      button.textContent = "Tap to start";
      mode = "statement";
    }
  }
  let mode: "confirm" | "calibrate" | "baseline" | "statement" = "calibrate";

  function onButton(): void {
    const now = performance.now();
    if (rec) {
      if (rec.kind !== "calibrate" && now - rec.t0 - rec.pausedMs >= rec.minMs) stopRecording(now);
      return;
    }
    if (step === "calibrate" && mode === "confirm") { setStep("baseline"); return; }
    if (!lastQualityOk) return;
    if (step === "calibrate") {
      cal.start(now, TIMING.calibrationSec);
      rec = { kind: "calibrate", t0: now, lengthMs: TIMING.calibrationSec * 1000, minMs: Infinity, mesh: [], pausedAt: null, pausedMs: 0 };
      title.textContent = "Hold still…";
      button.textContent = "Calibrating";
    } else if (step === "baseline") {
      app.recorder.begin("baseline", "baseline", now);
      rec = { kind: "baseline", t0: now, lengthMs: TIMING.baselineSec * 1000, minMs: TIMING.baselineMinSec * 1000, mesh: [], pausedAt: null, pausedMs: 0 };
      title.textContent = "Keep talking…";
      button.textContent = "Recording";
    } else if (step === "statement") {
      app.recorder.begin(`statement:${n}`, "statement", now);
      rec = { kind: "statement", t0: now, lengthMs: TIMING.statementMaxSec * 1000, minMs: TIMING.statementMinSec * 1000, mesh: [], pausedAt: null, pausedMs: 0 };
      title.textContent = `Statement ${n} — say it`;
      button.textContent = "Tap when done";
      cards.hidden = true;
    }
    button.classList.add("recording");
  }

  function stopRecording(now: number): void {
    const r = rec!;
    rec = null;
    button.classList.remove("recording");
    setRing(ring.lastElementChild, 0);
    if (r.kind === "baseline") {
      turn.baseline = app.recorder.end(now);
      setStep("statement");
    } else if (r.kind === "statement") {
      const segment = app.recorder.end(now);
      turn.statements.push({ n, segment, track: { ...rig.videoSize, mirrored: rig.mirror, frames: r.mesh } });
      n++;
      if (n > 3) finish();
      else setStep("statement");
    }
  }

  function finish(): void {
    app.scorer.setBaseline(turn.baseline!);
    turn.results = app.scorer.scoreAll(turn.statements.map((s) => s.segment));
    app.go("passback");
  }

  function onFrame(f: Frame): void {
    const now = f.out.t;
    const lost = rig.faceLostMs(now);
    const q = f.quality;
    lastQualityOk = !!f.face && q.value >= QUALITY_PARAMS.minimum;
    if (!f.face) app.badge(lost > TIMING.faceLostMs ? "Where did you go?" : "Looking for your face…");
    else if (q.hint) app.badge(q.hint);
    else app.badge("");

    if (!rec) {
      const ok = lastQualityOk || (step === "calibrate" && mode === "confirm");
      button.disabled = !ok;
      hint.textContent = ok ? "" : f.face ? q.hint : "Where did you go?";
      return;
    }
    const r = rec;
    if (r.kind === "calibrate") {
      const res = cal.step(f.out);
      setRing(ring.lastElementChild, cal.progress);
      if (res === "done") { rec = null; button.classList.remove("recording"); app.toast("Calibrated to your neutral face."); setStep("baseline"); }
      else if (res === "failed") { rec = null; button.classList.remove("recording"); app.toast("Couldn't see your face clearly — try again."); setStep("calibrate"); }
      return;
    }
    // Baseline / statement: record every frame; pause the ring when the face is gone for a while.
    app.recorder.push(f.out, { value: q.value, reason: q.reason });
    if (r.kind === "statement") {
      const m = rig.meshFrame(f);
      if (m) r.mesh.push(m);
    }
    if (lost > TIMING.faceLostMs) {
      r.pausedAt ??= now;
      hint.textContent = "Paused — where did you go?";
    } else if (r.pausedAt !== null) {
      r.pausedMs += now - r.pausedAt;
      r.pausedAt = null;
      hint.textContent = "";
    }
    const elapsed = r.pausedAt === null ? now - r.t0 - r.pausedMs : r.pausedAt - r.t0 - r.pausedMs;
    setRing(ring.lastElementChild, elapsed / r.lengthMs);
    if (r.kind === "statement") hint.textContent = elapsed >= r.minMs ? `${Math.max(0, (r.lengthMs - elapsed) / 1000).toFixed(0)} s left` : hint.textContent;
    if (r.kind === "baseline" && elapsed >= r.minMs) button.textContent = "Done talking";
    if (elapsed >= r.lengthMs) stopRecording(now);
  }

  const off = rig.onFrame(onFrame);
  app.ensureCamera().then((ok) => {
    if (!ok) { app.go("handoff"); return; }
    setStep("calibrate");
  });

  return {
    el,
    camera: true,
    destroy() {
      off();
      cal.cancel();
      if (app.recorder.current) app.recorder.end(performance.now());
    },
  };
}
