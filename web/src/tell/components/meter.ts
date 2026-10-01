import type { TellResult } from "../../engine/tell.ts";
import { h } from "../dom.ts";

/**
 * The Tell Meter: a bar and a number, animated from zero to the final score.
 * The number is the scorer's display score; nothing is invented for effect.
 */
export interface Meter {
  el: HTMLElement;
  /** Animates to the result's score over `ms`; resolves when done. */
  run(ms: number): Promise<void>;
}

export function meter(n: number, r: TellResult | null): Meter {
  const bar = h("span", { class: "tm-fill" });
  const num = h("span", { class: "tm-num", "data-testid": `meter-${n}` }, r?.status === "scored" ? "0" : "–");
  const el = h("div", { class: "tm" },
    h("div", { class: "tm-head" }, h("span", { class: "tm-label" }, `Statement ${n}`), num),
    h("div", { class: "tm-track" }, bar),
  );
  if (!r || r.status !== "scored") {
    el.classList.add("unscored");
    el.append(h("div", { class: "tm-note" }, r ? `Not scored: ${r.reason}.` : "No recording."));
  }
  const score = r?.status === "scored" ? r.score : 0;
  const colour = (v: number) => `hsl(${48 - 48 * Math.min(1, v / 100)}, 100%, ${62 - 10 * (v / 100)}%)`;
  return {
    el,
    run: (ms) =>
      new Promise((resolve) => {
        if (!r || r.status !== "scored") return resolve();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / Math.max(1, ms));
          const e = 1 - Math.pow(1 - p, 3);
          const v = score * e;
          bar.style.width = `${v}%`;
          bar.style.background = colour(v);
          num.textContent = String(Math.round(v));
          if (p < 1) requestAnimationFrame(tick);
          else {
            el.classList.add("done");
            resolve();
          }
        };
        requestAnimationFrame(tick);
      }),
  };
}

/** Caption lines under a meter: the scorer's captions, or why it was not scored. */
export function captions(r: TellResult | null): HTMLElement {
  const box = h("div", { class: "tm-captions" });
  if (!r || r.status !== "scored") return box;
  for (const c of r.captions) box.append(h("div", { class: "cap" }, c));
  if (!r.captions.length) box.append(h("div", { class: "cap quiet" }, "Nothing much leaked."));
  for (const c of r.chips) box.append(h("span", { class: "chip-sm" }, c));
  return box;
}
