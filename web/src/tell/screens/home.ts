import type { App, Screen } from "../app.ts";
import { VERSION } from "../config.ts";
import { h } from "../dom.ts";

export function home(app: App): Screen {
  const el = h("div", { class: "screen home" },
    h("header", { class: "home-head" },
      h("img", { src: "./icons/tell.svg", alt: "", width: "72", height: "72", class: "logo" }),
      h("h1", null, "TELL"),
      h("p", { class: "tag" }, "the poker-face party game"),
      h("p", { class: "line" }, "It can't catch lies. Nobody can. It catches tells."),
    ),
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: () => app.go(app.settings.privacyAck ? "players" : "privacy", { next: "players" }) }, "Play with friends"),
      h("button", { class: "secondary-btn", onclick: () => app.go(app.settings.privacyAck ? "pokerface" : "privacy", { next: "pokerface" }) }, "Poker Face (daily)"),
      h("button", { class: "text-btn", onclick: () => app.go("science") }, "How it works"),
    ),
    h("footer", { class: "home-foot" },
      h("button", { class: "icon-btn", "aria-label": "Settings", title: "Settings", onclick: () => app.go("settings") },
        h("span", { html: GEAR })),
      h("span", { class: "fine" }, `Everything stays on this phone · v${VERSION}`),
    ),
  );
  return { el };
}

export function privacy(app: App, params: { next?: "players" | "pokerface" } = {}): Screen {
  const next = params.next ?? "players";
  const el = h("div", { class: "screen privacy" },
    h("h2", null, "Before the camera"),
    h("p", { class: "lede" }, "Everything stays on this phone. No video is uploaded, ever. Replays are drawn from face points and are not saved unless you tap Save."),
    h("ul", { class: "bullets" },
      h("li", null, "The phone measures how much a face moves away from its own baseline, in this session, in this light."),
      h("li", null, "It scores tells, never truth. For fun between consenting players; not for hiring, interviews, school, work or deciding whether someone is truthful."),
      h("li", null, "No accounts, no analytics, no third-party scripts. Works offline once installed."),
    ),
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: () => { app.settings.privacyAck = true; app.saveSettings(); app.go(next); } }, "Got it — allow the camera next"),
      h("button", { class: "text-btn", onclick: () => app.go("home") }, "Back"),
    ),
  );
  return { el };
}

export const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>';
