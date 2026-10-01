import "./styles.css";
import { CameraError, openCamera, openFile, type Facing } from "./app/camera.ts";
import { defaultRecordingName, DevRecorder, saveRecording } from "./app/devrecorder.ts";
import { MODEL } from "./app/model.ts";
import { Overlay } from "./app/overlay.ts";
import { DEFAULT_SETTINGS, load, loadRaw, remove, save, type Settings } from "./app/storage.ts";
import { Tracker } from "./app/tracker.ts";
import { UI } from "./app/ui.ts";
import { EmotionEngine, type FrameResult } from "./engine/index.ts";
import type { Landmark } from "./platform/mediapipe/geometry.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const CALIBRATION_KEY = "calibration.mediapipe";
const GAINS_KEY = "gains.mediapipe";
const UI_INTERVAL_MS = 80;

const video = $<HTMLVideoElement>("#video");
const stage = $("#stage");
const overlay = new Overlay($<HTMLCanvasElement>("#overlay"));
const settings: Settings = load("settings", DEFAULT_SETTINGS);
const engine = new EmotionEngine(MODEL, "mediapipe", { sensitivity: settings.sensitivity, extended: settings.extended });
const ui = new UI(engine);

let tracker: Tracker | null = null;
let facing: Facing = "user";
let source: "camera" | "file" = "camera";
let running = false;
let lastVideoTime = -1;
let lastUi = 0;
let lastT = 0;
let fps = 0;
let lastOut: FrameResult | null = null;
let lastLandmarks: Landmark[] | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

// Restore a previous calibration for this device.
const saved = loadRaw<Record<string, number>>(CALIBRATION_KEY);
if (saved) engine.baseline.setCalibration(saved);
const savedGains = loadRaw<Record<string, number>>(GAINS_KEY);
if (savedGains) engine.baseline.setGains(savedGains);

// ------------------------------------------------------------------ start
$("#btn-start").addEventListener("click", () => start("camera"));
$<HTMLInputElement>("#file-input").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) start("file", file);
});

async function start(kind: "camera" | "file", file?: File): Promise<void> {
  const err = $("#start-error");
  err.hidden = true;
  const btn = $<HTMLButtonElement>("#btn-start");
  btn.disabled = true;
  btn.textContent = "Loading face model…";
  try {
    tracker ??= await Tracker.create(settings.delegate);
    source = kind;
    if (kind === "camera") await openCamera(video, facing);
    else await openFile(video, file!);
    applyMirror();
    $("#start").hidden = true;
    running = true;
    requestWakeLock();
    schedule();
    if (kind === "camera" && !engine.baseline.calibrated) $("#calib").hidden = false;
    setStatus();
  } catch (e) {
    err.textContent = e instanceof CameraError ? e.message : `Could not start: ${(e as Error).message ?? e}`;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Start camera";
  }
}

// ------------------------------------------------------------------ loop
function schedule(): void {
  if (!running) return;
  if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => frame());
  else requestAnimationFrame(() => frame());
}

function frame(): void {
  if (!running || !tracker) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && !document.hidden) {
    lastVideoTime = video.currentTime;
    const t = performance.now();
    const face = tracker.detect(video, t);
    if (devRecorder) devRecorder.push(t, face?.measurements ?? null);
    const out = engine.process(t, face?.measurements ?? null);
    lastOut = out;
    lastLandmarks = face?.landmarks ?? null;
    if (lastT) fps = fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
    lastT = t;
    overlay.draw(video, lastLandmarks, out.regions, out.aus, settings.overlay, isMirrored());
    if (out.events.length) ui.addEvents(out.events);
    handleCalibration(out);
    handleRange(out);
    if (t - lastUi > UI_INTERVAL_MS) {
      lastUi = t;
      ui.update(out, fps);
    }
  }
  schedule();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (running) requestWakeLock();
});

// ------------------------------------------------------------------ calibration
$("#btn-calib-go").addEventListener("click", beginCalibration);
$("#btn-calib-skip").addEventListener("click", () => { $("#calib").hidden = true; });
$("#status").addEventListener("click", () => { if (running) $("#calib").hidden = false; });
$("#btn-recalibrate").addEventListener("click", () => {
  ($("#settings") as HTMLDialogElement).close();
  $("#calib").hidden = false;
});
$("#btn-forget").addEventListener("click", () => {
  engine.baseline.reset();
  engine.baseline.resetGains();
  remove(CALIBRATION_KEY);
  remove(GAINS_KEY);
  toast("Calibration forgotten — the baseline will be learned from scratch.");
  setStatus();
});
$("#btn-range").addEventListener("click", () => {
  dialog.close();
  if (running) showRangeIntro();
});

let calibrating = false;
function beginCalibration(): void {
  if (!running) return;
  calibrating = true;
  engine.startCalibration(performance.now(), 3);
  $("#calib-title").textContent = "Hold still — relaxed face";
  $("#calib-text").textContent = "Look at the screen, lips together, brows relaxed.";
  $("#btn-calib-go").hidden = true;
  $("#btn-calib-skip").hidden = true;
}

function handleCalibration(out: FrameResult): void {
  if (!calibrating) return;
  const arc = document.getElementById("calib-arc");
  if (arc) arc.style.strokeDashoffset = String(276.46 * (1 - out.calibration.progress));
  if (!out.calibration.result) return;
  calibrating = false;
  $("#calib").hidden = true;
  $("#btn-calib-go").hidden = false;
  $("#btn-calib-skip").hidden = false;
  $("#calib-title").textContent = "Calibrate your neutral face";
  $("#calib-text").innerHTML = "Everyone's resting face is different. Look at the screen with a relaxed, neutral expression for three seconds so expressions are measured from <em>your</em> baseline.";
  if (arc) arc.style.strokeDashoffset = "276.46";
  if (out.calibration.result === "done") {
    const cal = engine.baseline.getCalibration();
    if (cal) save(CALIBRATION_KEY, cal);
    toast("Calibrated to your neutral face.");
    if (!Object.keys(engine.baseline.getGains()).length) showRangeIntro();
  } else {
    toast("Couldn't see your face clearly — try again with your face in view.");
  }
  setStatus();
}

// ------------------------------------------------------------------ range calibration
// A few maximal expressions teach the engine how far this person's face moves.
const rangeSteps = engine.cm.rangeSteps.filter((s) => s.targets.length > 0);
let rangeIndex = -1;
let rangeUpdated = 0;
let rangeWeak: string[] = [];

$("#btn-range-go").addEventListener("click", () => {
  rangeIndex = 0;
  rangeUpdated = 0;
  rangeWeak = [];
  $("#btn-range-go").hidden = true;
  $("#btn-range-skip").textContent = "Stop";
  startRangeStep();
});
$("#btn-range-skip").addEventListener("click", () => finishRange(rangeIndex >= 0));

function showRangeIntro(): void {
  rangeIndex = -1;
  $("#range-title").textContent = "Calibrate your range";
  $("#range-count").textContent = `${rangeSteps.length} faces · about ${Math.round(rangeSteps.length * (MODEL.params.range.settleSec + MODEL.params.range.holdSec))} seconds`;
  $("#range-text").textContent = "Faces move by different amounts, and trackers under-report some movements — especially the brows. Make each face as strongly as you can so your full movement counts as full intensity.";
  $("#btn-range-go").hidden = false;
  $("#btn-range-skip").textContent = "Not now";
  $("#range").hidden = false;
}

function startRangeStep(): void {
  const step = rangeSteps[rangeIndex];
  $("#range-count").textContent = `Face ${rangeIndex + 1} of ${rangeSteps.length}`;
  $("#range-title").textContent = step.prompt;
  $("#range-text").textContent = "Hold it until the ring is full.";
  engine.startRangeStep(performance.now(), step.id);
}

function handleRange(out: FrameResult): void {
  if (rangeIndex < 0 || !out.range.step) return;
  const arc = document.getElementById("range-arc");
  if (arc) arc.style.strokeDashoffset = String(276.46 * (1 - out.range.progress));
  if (!out.range.result) return;
  if (out.range.result === "done") {
    rangeUpdated += out.range.updated?.length ?? 0;
    if (out.range.weak?.length) rangeWeak.push(rangeSteps[rangeIndex].prompt);
  }
  rangeIndex++;
  if (rangeIndex < rangeSteps.length) startRangeStep();
  else finishRange(true);
}

function finishRange(completed: boolean): void {
  engine.baseline.cancelRangeStep();
  $("#range").hidden = true;
  const arc = document.getElementById("range-arc");
  if (arc) arc.style.strokeDashoffset = "276.46";
  const wasRunning = rangeIndex >= 0;
  rangeIndex = -1;
  if (!wasRunning) return;
  save(GAINS_KEY, engine.baseline.getGains());
  if (completed) {
    toast(rangeWeak.length
      ? `Range calibrated (${rangeUpdated} signals). Little movement seen for: ${rangeWeak.join("; ")}.`
      : `Range calibrated — ${rangeUpdated} signals tuned to your face.`);
  }
}

function setStatus(): void {
  const chip = $("#status");
  chip.classList.toggle("ok", engine.baseline.calibrated);
  $("#status-text").textContent = engine.baseline.calibrated ? `Calibrated · ${tracker?.delegate ?? ""}` : "Tap to calibrate";
}

// ------------------------------------------------------------------ camera controls
$("#btn-flip").addEventListener("click", async () => {
  if (source !== "camera") return;
  facing = facing === "user" ? "environment" : "user";
  try {
    await openCamera(video, facing);
    applyMirror();
  } catch (e) {
    toast((e as Error).message);
  }
});

function isMirrored(): boolean {
  return source === "camera" && facing === "user" && settings.mirror;
}
function applyMirror(): void {
  stage.classList.toggle("mirrored", isMirrored());
}

// ------------------------------------------------------------------ settings
const dialog = $("#settings") as HTMLDialogElement;
const sens = $<HTMLInputElement>("#sens");
const sensOut = $("#sens-out");
const overlayMode = $<HTMLSelectElement>("#overlay-mode");
const mirror = $<HTMLInputElement>("#mirror");
const delegate = $<HTMLSelectElement>("#delegate");
const extendedBox = $<HTMLInputElement>("#extended");

$("#btn-settings").addEventListener("click", () => {
  sens.value = String(settings.sensitivity);
  sensOut.textContent = `${settings.sensitivity.toFixed(1)}×`;
  overlayMode.value = settings.overlay;
  mirror.checked = settings.mirror;
  delegate.value = settings.delegate;
  extendedBox.checked = settings.extended;
  dialog.showModal();
});
extendedBox.addEventListener("change", () => {
  settings.extended = extendedBox.checked;
  engine.extended = settings.extended;
  ui.setExtended(settings.extended);
  save("settings", settings);
});
sens.addEventListener("input", () => {
  settings.sensitivity = Number(sens.value);
  engine.sensitivity = settings.sensitivity;
  sensOut.textContent = `${settings.sensitivity.toFixed(1)}×`;
  save("settings", settings);
});
overlayMode.addEventListener("change", () => { settings.overlay = overlayMode.value as Settings["overlay"]; save("settings", settings); });
mirror.addEventListener("change", () => { settings.mirror = mirror.checked; applyMirror(); save("settings", settings); });
delegate.addEventListener("change", async () => {
  settings.delegate = delegate.value as Settings["delegate"];
  save("settings", settings);
  if (!tracker) return;
  const old = tracker;
  tracker = null;
  old.close();
  tracker = await Tracker.create(settings.delegate);
  setStatus();
});

// ------------------------------------------------------------------ developer recorder
// Writes raw measurements (numbers only) with tapped markers; see src/app/devrecorder.ts.
let devRecorder: DevRecorder | null = null;
const devbar = $("#devbar");
const devMarked = (cmd: string) => { devRecorder?.mark(cmd); updateDevStatus(); };

$("#btn-dev-record").addEventListener("click", () => {
  dialog.close();
  if (!running) { toast("Start the camera first."); return; }
  devRecorder = new DevRecorder();
  devRecorder.calibration = engine.baseline.getCalibration() ?? undefined;
  devRecorder.gains = engine.baseline.getGains();
  for (const n of [1, 2, 3]) $(`#dev-false-${n}`).setAttribute("aria-pressed", "false");
  $("#dev-statement").textContent = "Statement 1";
  devbar.hidden = false;
  updateDevStatus();
});
$("#dev-baseline").addEventListener("click", () => devMarked("baseline"));
$("#dev-statement").addEventListener("click", () => {
  if (!devRecorder) return;
  devRecorder.nextStatement();
  $("#dev-statement").textContent = `Statement ${devRecorder.statementCount + 1}`;
  updateDevStatus();
});
$("#dev-feed").addEventListener("click", () => devMarked("feed"));
$("#dev-end").addEventListener("click", () => devMarked("end"));
for (const n of [1, 2, 3]) {
  $(`#dev-false-${n}`).addEventListener("click", () => {
    for (const k of [1, 2, 3]) $(`#dev-false-${k}`).setAttribute("aria-pressed", String(k === n));
    devMarked(`false:${n}`);
  });
}
$("#dev-save").addEventListener("click", async () => {
  if (!devRecorder) return;
  const rec = devRecorder;
  rec.mark("end");
  const name = window.prompt("File name", defaultRecordingName(rec.startedAt)) ?? defaultRecordingName(rec.startedAt);
  try {
    const how = await saveRecording(rec.toJSON(name.replace(/\.json$/i, "")));
    toast(how === "shared" ? "Recording handed to the share sheet." : `Downloaded ${name}.json`);
    devRecorder = null;
    devbar.hidden = true;
  } catch {
    toast("Not saved — still recording.");
  }
});
$("#dev-discard").addEventListener("click", () => {
  devRecorder = null;
  devbar.hidden = true;
  toast("Recording discarded.");
});

function updateDevStatus(): void {
  if (!devRecorder) return;
  const r = devRecorder;
  $("#dev-status").textContent = `${r.seconds.toFixed(0)} s · ${r.frameCount} frames${r.lastMarker ? ` · ${r.lastMarker}` : ""}`;
}
window.setInterval(() => { if (devRecorder && !devbar.hidden) updateDevStatus(); }, 1000);

// ------------------------------------------------------------------ misc
let toastTimer = 0;
function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3200);
}

async function requestWakeLock(): Promise<void> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && !document.hidden) wakeLock = await wl.request("screen");
  } catch {
    wakeLock = null; // not supported or denied: the screen may dim, detection still works
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker registration failed", e));
  });
}

// Test/debug hook (used by the end-to-end test; harmless in production).
(window as unknown as { __mien: unknown }).__mien = {
  get last() { return lastOut; },
  get delegate() { return tracker?.delegate; },
  engine,
  get wakeLock() { return wakeLock !== null; },
};
