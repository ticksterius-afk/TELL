import { smoothstep } from "../engine/filters.ts";

/**
 * Tracking-quality estimate, per frame, from what the tracker can see:
 *  - size:  face box height over frame height, smoothstep 0.12 → 0.25
 *  - light: mean luminance of the face crop (0–255), smoothstep 40 → 90
 *  - pose:  1 within 20° of the baseline yaw/pitch, 0 at 35°
 * quality = min(size, light, pose). Below 0.5 the statement is not scored.
 * Pure function so it can be unit-tested and ported.
 */
export interface QualityInputs {
  /** Face bounding-box height as a fraction of the frame height. */
  boxHeight: number;
  /** Mean luminance of the face crop, 0–255; undefined when pixels could not be read. */
  luminance?: number;
  /** Head yaw/pitch relative to the person's neutral, degrees. */
  yaw: number;
  pitch: number;
}

export interface Quality {
  value: number;
  size: number;
  light: number;
  pose: number;
  /** The lowest factor, or undefined when everything is fine. */
  reason?: "size" | "light" | "pose";
  /** What to fix, as a short instruction; empty when the quality is good. */
  hint: string;
}

export const QUALITY_PARAMS = {
  size: [0.12, 0.25] as const,
  light: [40, 90] as const,
  pose: [20, 35] as const,
  /** Recording can start at or above this. */
  minimum: 0.5,
};

export function estimateQuality(i: QualityInputs): Quality {
  const size = smoothstep(QUALITY_PARAMS.size[0], QUALITY_PARAMS.size[1], i.boxHeight);
  const light = i.luminance === undefined ? 1 : smoothstep(QUALITY_PARAMS.light[0], QUALITY_PARAMS.light[1], i.luminance);
  const dev = Math.max(Math.abs(i.yaw), Math.abs(i.pitch));
  const pose = 1 - smoothstep(QUALITY_PARAMS.pose[0], QUALITY_PARAMS.pose[1], dev);
  const value = Math.min(size, light, pose);
  let reason: Quality["reason"];
  if (value < 1) reason = size <= light && size <= pose ? "size" : light <= pose ? "light" : "pose";
  const hint = value >= QUALITY_PARAMS.minimum ? "" : reason === "size" ? "Come closer" : reason === "light" ? "Move to the light" : "Face the phone";
  return { value, size, light, pose, reason, hint };
}

/** Quality for a frame without a face. */
export const NO_FACE_QUALITY: Quality = { value: 0, size: 0, light: 0, pose: 0, reason: "size", hint: "Where did you go?" };
