/** Tiny DOM builder: h("button", { class: "primary-btn", onclick }, "Go"). */
export type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "html") el.innerHTML = String(v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (k === "disabled" || k === "hidden" || k === "checked") (el as unknown as Record<string, unknown>)[k] = v === true;
      else if (k === "value") (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function svgRing(id: string, size = 120): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "ring");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;
  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", "50"); track.setAttribute("cy", "50"); track.setAttribute("r", "44"); track.setAttribute("class", "track");
  const arc = document.createElementNS(ns, "circle");
  arc.setAttribute("cx", "50"); arc.setAttribute("cy", "50"); arc.setAttribute("r", "44"); arc.setAttribute("class", "arc"); arc.id = id;
  svg.append(track, arc);
  return svg;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
