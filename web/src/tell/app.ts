import type { SessionRecorder } from "../engine/recorder.ts";
import type { TellScorer } from "../engine/tell.ts";
import type { CameraRig } from "./rig.ts";
import type { Round } from "./state.ts";

export interface TellSettings {
  mirror: boolean;
  privacyAck: boolean;
  players: string[];
}

export const DEFAULT_TELL_SETTINGS: TellSettings = { mirror: true, privacyAck: false, players: [] };

export type ScreenName =
  | "home" | "privacy" | "players" | "handoff" | "hotseat" | "passback" | "vote" | "reveal" | "roundend"
  | "pokerface" | "science" | "settings";

export interface Screen {
  el: HTMLElement;
  /** True for screens that analyse camera frames (the stage and the recording indicator show). */
  camera?: boolean;
  destroy?: () => void;
}

export interface App {
  rig: CameraRig;
  recorder: SessionRecorder;
  scorer: TellScorer;
  settings: TellSettings;
  round: Round | null;
  screen: ScreenName;
  go(name: ScreenName, params?: Record<string, unknown>): void;
  toast(msg: string): void;
  saveSettings(): void;
  /** Shows the quality badge text (empty hides it). */
  badge(text: string, tone?: "warn" | "ok"): void;
  /** Opens the camera and loads the face model; shows the privacy screen first on first run. Resolves false on failure (a toast explains). */
  ensureCamera(): Promise<boolean>;
}
