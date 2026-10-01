import { drawFaceMesh } from "../../app/overlay.ts";
import type { TellResult } from "../../engine/tell.ts";
import { TIMING } from "../config.ts";
import { h } from "../dom.ts";
import type { MeshFrame, MeshTrack } from "../state.ts";

/**
 * The leak replay: the statement's peak window as a slow-motion landmark mesh
 * with the region heat-map, looping. Drawn from face points kept in memory;
 * nothing is saved unless the player taps Save.
 */
export interface Replay {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  frames: MeshFrame[];
  start(): void;
  stop(): void;
  /** Number of frames drawn so far (for tests). */
  drawn: number;
}

export function windowFrames(track: MeshTrack, r: TellResult): MeshFrame[] {
  const inWin = track.frames.filter((f) => f.t >= r.peak.t0 && f.t <= r.peak.t1);
  return inWin.length ? inWin : track.frames.slice(0, 1);
}

/** Face bounds over a set of frames, in normalised video coordinates. */
function bounds(frames: MeshFrame[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const f of frames) {
    for (let i = 0; i < f.xy.length; i += 2) {
      const x = f.xy[i], y = f.xy[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
}

/** Draws one mesh frame fitted into a canvas (face centred with a margin), mirrored like the selfie view. */
export function drawMeshFrame(ctx: CanvasRenderingContext2D, w: number, hgt: number, f: MeshFrame, track: MeshTrack, b: ReturnType<typeof bounds>, dpr: number, heat = 1): void {
  const vw = track.width, vh = track.height;
  const bw = (b.x1 - b.x0) * vw, bh = (b.y1 - b.y0) * vh;
  const s = Math.min(w / (bw * 1.3), hgt / (bh * 1.25));
  const cx = ((b.x0 + b.x1) / 2) * vw, cy = ((b.y0 + b.y1) / 2) * vh;
  const X = (i: number) => {
    const x = (f.xy[i * 2] * vw - cx) * s;
    return w / 2 + (track.mirrored ? -x : x);
  };
  const Y = (i: number) => hgt / 2 + (f.xy[i * 2 + 1] * vh - cy) * s;
  const regions: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.regions)) regions[k] = v * heat;
  drawFaceMesh(ctx, X, Y, regions, {}, "regions", track.mirrored, dpr);
}

export function replay(track: MeshTrack, r: TellResult, caption: string): Replay {
  const frames = windowFrames(track, r);
  const b = bounds(frames);
  const canvas = h("canvas", { class: "replay-canvas", "data-testid": "replay" });
  const cap = h("div", { class: "replay-caption" }, caption);
  const time = h("span", { class: "replay-time" }, "");
  const el = h("div", { class: "replay" }, canvas, h("div", { class: "replay-bar" }, h("span", { class: "replay-tag" }, "0.5× slow motion · face points only"), time), cap);
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  let startedAt = 0;
  const span = Math.max(1, frames[frames.length - 1].t - frames[0].t);
  const api: Replay = {
    el, canvas, frames, drawn: 0,
    start() {
      startedAt = performance.now();
      const tick = (now: number) => {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(canvas.clientWidth * dpr), hgt = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
        const elapsed = ((now - startedAt) * TIMING.replaySpeed) % (span + 400);
        const target = frames[0].t + Math.min(span, elapsed);
        let i = 0;
        while (i + 1 < frames.length && frames[i + 1].t <= target) i++;
        ctx.clearRect(0, 0, w, hgt);
        drawMeshFrame(ctx, w, hgt, frames[i], track, b, dpr);
        time.textContent = `${((frames[i].t - r.peak.t0) / 1000).toFixed(1)} s`;
        api.drawn++;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
  return api;
}

/** A PNG strip of six frames from the replay window with the caption, as a Blob. */
export async function replayStrip(track: MeshTrack, r: TellResult, caption: string, who: string): Promise<Blob> {
  const frames = windowFrames(track, r);
  const b = bounds(frames);
  const n = Math.min(6, frames.length);
  const tile = 220, tileH = 280, pad = 12, footer = 92;
  const c = document.createElement("canvas");
  c.width = pad + n * (tile + pad);
  c.height = pad + tileH + footer;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < n; k++) {
    const f = frames[Math.round((k * (frames.length - 1)) / Math.max(1, n - 1))];
    ctx.save();
    ctx.translate(pad + k * (tile + pad), pad);
    ctx.fillStyle = "#141821";
    ctx.beginPath();
    ctx.roundRect(0, 0, tile, tileH, 16);
    ctx.fill();
    ctx.clip();
    drawMeshFrame(ctx, tile, tileH, f, track, b, 1.6);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "600 14px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(`${((f.t - r.peak.t0) / 1000).toFixed(1)} s`, 12, tileH - 14);
    ctx.restore();
  }
  ctx.fillStyle = "#eef1f6";
  ctx.font = "700 26px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(caption, pad, pad + tileH + 38);
  ctx.fillStyle = "#a7afbd";
  ctx.font = "500 16px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`TELL · ${who} · tell ${r.score}/100 · movement vs their own baseline, not a verdict`, pad, pad + tileH + 68);
  return new Promise((resolve, reject) => c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"));
}
