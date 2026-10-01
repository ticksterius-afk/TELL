import "../styles.css";
import "./styles.css";
import { load, save } from "../app/storage.ts";
import { TELL_PARAMS } from "../app/tellModel.ts";
import { SessionRecorder } from "../engine/recorder.ts";
import { TellScorer } from "../engine/tell.ts";
import { DEFAULT_TELL_SETTINGS, type App, type Screen, type ScreenName, type TellSettings } from "./app.ts";
import { FAST } from "./config.ts";
import { clear } from "./dom.ts";
import { CameraError, CameraRig } from "./rig.ts";
import { home, privacy } from "./screens/home.ts";
import { hotseat } from "./screens/hotseat.ts";
import { handoff, passback, players } from "./screens/players.ts";
import { pokerface } from "./screens/pokerface.ts";
import { roundend } from "./screens/roundend.ts";
import { science } from "./screens/science.ts";
import { settings } from "./screens/settings.ts";
import { reveal, vote } from "./screens/vote.ts";
import type { Round } from "./state.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const SCREENS: Record<ScreenName, (app: App, params: Record<string, unknown>) => Screen> = {
  home, privacy: (a, p) => privacy(a, p as { next?: "players" | "pokerface" }), players, handoff, hotseat, passback, vote, reveal, roundend, pokerface, science, settings,
};

class TellApp implements App {
  readonly rig = new CameraRig($("#stage"), $<HTMLVideoElement>("#video"), $<HTMLCanvasElement>("#overlay"));
  readonly recorder = new SessionRecorder(TELL_PARAMS.aus);
  readonly scorer = new TellScorer(TELL_PARAMS);
  settings: TellSettings = load("tell.settings", DEFAULT_TELL_SETTINGS);
  round: Round | null = null;
  screen: ScreenName = "home";
  private current: Screen | null = null;
  private readonly host = $("#screen");
  private readonly badgeEl = $("#badge");
  private toastTimer = 0;
  /** Screen wake lock while the camera is up (null when unsupported). */
  wakeLock: { release(): Promise<void> } | null = null;

  constructor() {
    this.rig.mirror = this.settings.mirror;
  }

  go(name: ScreenName, params: Record<string, unknown> = {}): void {
    this.current?.destroy?.();
    clear(this.host);
    this.screen = name;
    const s = SCREENS[name](this, params);
    this.current = s;
    this.rig.active = !!s.camera;
    this.host.className = s.camera ? "over-camera" : "";
    this.host.append(s.el);
    this.badge("");
    window.scrollTo(0, 0);
    document.body.dataset.screen = name;
  }

  toast(msg: string): void {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), 3000);
  }

  saveSettings(): void {
    save("tell.settings", this.settings);
  }

  badge(text: string, tone: "warn" | "ok" = "warn"): void {
    this.badgeEl.hidden = !text;
    this.badgeEl.textContent = text;
    this.badgeEl.className = `badge ${tone}`;
  }

  async ensureCamera(): Promise<boolean> {
    try {
      await this.rig.start();
      this.requestWakeLock();
      return true;
    } catch (e) {
      this.toast(e instanceof CameraError ? e.message : `Could not start the camera: ${(e as Error).message ?? e}`);
      return false;
    }
  }

  private async requestWakeLock(): Promise<void> {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !document.hidden) this.wakeLock = await wl.request("screen");
    } catch {
      this.wakeLock = null;
    }
  }
}

const app = new TellApp();
app.go("home");

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && app.rig.streaming) void app.ensureCamera();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker registration failed", e));
  });
}

// Test/debug hook (used by the end-to-end test; harmless in production).
(window as unknown as { __tell: unknown }).__tell = {
  app,
  fast: FAST,
  get screen() { return app.screen; },
  get last() { return app.rig.last?.out ?? null; },
  get quality() { return app.rig.last?.quality ?? null; },
  get round() { return app.round; },
  get results() { return app.round?.current?.results ?? null; },
  params: TELL_PARAMS,
};
