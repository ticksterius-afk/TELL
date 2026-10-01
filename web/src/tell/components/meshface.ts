import { MODEL } from "../../app/model.ts";
import { h } from "../dom.ts";

/**
 * The "mesh face": a line-art face that pulls one of the model's expression
 * prototypes at the player. The pose is derived from the prototype's slots
 * (which AUs it needs), so no licensed imagery is involved; the look matches
 * the tracking overlay.
 */
const AU_TARGETS: Record<string, number> = {};

/** AU intensities implied by an expression's prototype (first variant's core and support slots). */
export function prototypeAUs(id: string): Record<string, number> {
  const e = MODEL.expressions.find((x) => x.id === id);
  const aus: Record<string, number> = {};
  if (!e) return aus;
  const variant = e.variants?.[0] ?? { slots: e.slots ?? [], support: e.support ?? [] };
  for (const s of variant.slots ?? []) for (const f of s.any.slice(0, 2)) aus[f.replace(/[LRUB]$/, "")] = Math.max(aus[f] ?? 0, 0.9);
  for (const s of variant.support ?? []) for (const f of s.any.slice(0, 1)) aus[f.replace(/[LRUB]$/, "")] = Math.max(aus[f] ?? 0, 0.6);
  return aus;
}

export function meshFace(id: string, size = 220): SVGSVGElement {
  const a = { ...AU_TARGETS, ...prototypeAUs(id) };
  const g = (k: string) => a[k] ?? 0;
  const browUp = Math.max(g("AU1"), g("AU2"));
  const browIn = g("AU1") * 0.6;
  const browDown = g("AU4");
  const eyeWide = g("AU5");
  const squint = Math.max(g("AU6") * 0.6, g("AU7"));
  const closed = g("AU43");
  const nose = g("AU9");
  const lipUp = g("AU10");
  const smile = g("AU12");
  const dimple = g("AU14");
  const down = g("AU15");
  const chin = g("AU17");
  const stretch = g("AU20");
  const press = Math.max(g("AU23"), g("AU24"));
  const jaw = Math.max(g("AU26"), g("AU27") * 1.3, g("AU25") * 0.4);

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 200 240");
  svg.setAttribute("class", "meshface");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = `${size}px`;
  svg.style.height = `${(size * 240) / 200}px`;
  const path = (d: string, cls = "", width = 2.2) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", cls);
    p.setAttribute("stroke-width", String(width));
    svg.appendChild(p);
  };
  // Face oval.
  path("M100 18 C 150 18, 172 70, 170 120 C 168 180, 135 222, 100 222 C 65 222, 32 180, 30 120 C 28 70, 50 18, 100 18 Z", "oval", 1.6);
  // Brows: raise lifts them, AU4 lowers and pulls the inner ends together.
  for (const s of [-1, 1]) {
    const cx = 100 + s * 36;
    const inner = cx - s * 20, outer = cx + s * 22;
    const y = 72 - browUp * 14 + browDown * 8;
    const yi = y + browIn * -4 + browDown * 6 - (browUp > 0 ? g("AU1") * 4 : 0);
    const yo = y + 2 - g("AU2") * 4;
    const xi = inner + s * browDown * 5;
    path(`M${xi} ${yi} Q ${cx} ${y - 10 + browDown * 6} ${outer} ${yo}`, "brow", 4 - browDown);
  }
  // Eyes: wide opens them, squint/closed narrows them.
  for (const s of [-1, 1]) {
    const cx = 100 + s * 36, cy = 98;
    const open = Math.max(1.5, 9 + eyeWide * 7 - squint * 5 - closed * 9);
    const w = 20;
    path(`M${cx - w} ${cy} Q ${cx} ${cy - open} ${cx + w} ${cy} Q ${cx} ${cy + open * 0.8} ${cx - w} ${cy}`, "eye", 2);
    if (closed < 0.6) {
      const iris = document.createElementNS(ns, "circle");
      iris.setAttribute("cx", String(cx)); iris.setAttribute("cy", String(cy + 1)); iris.setAttribute("r", String(Math.min(6, open * 0.7)));
      iris.setAttribute("class", "iris");
      svg.appendChild(iris);
    }
    if (squint > 0.3) path(`M${cx + s * 24} ${cy - 4} l ${s * 6} -3 M${cx + s * 24} ${cy + 4} l ${s * 6} 3`, "lines", 1.4);
  }
  // Nose: AU9 wrinkles the bridge and lifts the alae.
  path(`M100 100 L 96 ${140 - nose * 6} Q 100 ${146 - nose * 8} 104 ${140 - nose * 6}`, "nose", 1.8);
  if (nose > 0.3) path("M92 118 q 8 -4 16 0 M90 126 q 10 -5 20 0", "lines", 1.4);
  // Mouth: corners up/down/out, jaw opens, lips press or stretch, upper lip rises.
  const my = 172 + jaw * 6;
  const cornerY = my - smile * 14 + down * 10;
  const cornerX = 26 + smile * 10 + stretch * 14 - press * 4;
  const openH = jaw * 26 + (smile > 0.5 ? 4 : 0);
  const upper = my - lipUp * 7 - (press ? press * 1.5 : 0);
  path(`M${100 - cornerX} ${cornerY} Q 100 ${upper - 2} ${100 + cornerX} ${cornerY}`, "lip", 2.6);
  path(`M${100 - cornerX} ${cornerY} Q 100 ${my + openH + 4 + chin * -3} ${100 + cornerX} ${cornerY}`, "lip", 2.6);
  if (dimple > 0.3) path(`M${100 - cornerX - 6} ${cornerY - 3} l -4 6 M${100 + cornerX + 6} ${cornerY - 3} l 4 6`, "lines", 1.4);
  if (chin > 0.3) path("M86 198 q 14 -8 28 0", "lines", 1.4);
  if (jaw > 0.3) path(`M${100 - cornerX + 6} ${cornerY + 2} Q 100 ${my + openH} ${100 + cornerX - 6} ${cornerY + 2}`, "mouth-open", 1);
  // Forehead lines appear with raised brows, glabella furrows with lowered ones.
  if (browUp > 0.4) path("M58 50 q 42 -8 84 0 M62 40 q 38 -8 76 0", "lines", 1.4);
  if (browDown > 0.4) path("M94 60 l 2 16 M106 60 l -2 16", "lines", 1.6);
  return svg;
}

export function meshFaceCard(id: string): HTMLElement {
  const e = MODEL.expressions.find((x) => x.id === id);
  return h("div", { class: "meshface-card" }, meshFace(id), h("span", { class: "fine" }, e ? e.emoji : ""));
}
