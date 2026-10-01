import type { App, Screen } from "../app.ts";
import { shareText } from "../components/share.ts";
import { h } from "../dom.ts";
import { newRound, newTurn, scoreboardText } from "../state.ts";

export function roundend(app: App): Screen {
  const round = app.round!;
  const sorted = [...round.players].sort((a, b) => b.score - a.score);
  const top = sorted[0].score;
  const el = h("div", { class: "screen roundend" },
    h("h2", null, "Scoreboard"),
    h("ol", { class: "scoreboard", "data-testid": "scoreboard" },
      ...sorted.map((p) => h("li", { class: p.score === top && top > 0 ? "lead" : "" }, h("span", null, p.name), h("b", null, String(p.score)))),
    ),
    h("p", { class: "fine" }, "Detectives: +1 for each false statement spotted. Hot seat: +1 for every detective fooled."),
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: () => { app.round = newRound(round.players); app.round.current = newTurn(0); app.go("handoff"); } }, "Play again"),
      h("button", { class: "secondary-btn", onclick: async () => { const how = await shareText(scoreboardText(round), "TELL scoreboard"); app.toast(how === "copied" ? "Scoreboard copied." : how === "failed" ? "Couldn't share." : "Shared."); } }, "Share scoreboard"),
      h("button", { class: "text-btn", onclick: () => { app.round = null; app.rig.stop(); app.go("home"); } }, "Home"),
    ),
  );
  return { el };
}
