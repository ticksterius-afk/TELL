import type { App, Screen } from "../app.ts";
import { h } from "../dom.ts";
import { SCIENCE } from "../content/science.ts";

export function science(app: App): Screen {
  const el = h("div", { class: "screen science" },
    h("h2", null, "How it works"),
    h("p", { class: "lede" }, SCIENCE.intro),
    ...SCIENCE.components.map((c) =>
      h("section", { class: "sci-card" },
        h("h3", null, c.title),
        h("p", null, c.what),
        h("p", { class: "fine" }, c.evidence),
        h("p", { class: "cite" }, c.cite),
      ),
    ),
    h("section", { class: "sci-card muted" },
      h("h3", null, SCIENCE.notScored.title),
      ...SCIENCE.notScored.items.map((t) => h("p", null, t)),
      h("p", { class: "cite" }, SCIENCE.notScored.cite),
    ),
    h("section", { class: "sci-card muted" },
      h("h3", null, SCIENCE.terms.title),
      ...SCIENCE.terms.items.map((t) => h("p", null, t)),
    ),
    h("div", { class: "actions" }, h("button", { class: "primary-btn", onclick: () => app.go("home") }, "Back")),
  );
  return { el };
}
