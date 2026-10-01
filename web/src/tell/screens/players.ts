import type { App, Screen } from "../app.ts";
import { h } from "../dom.ts";
import { newRound, newTurn } from "../state.ts";

const MIN = 2;
const MAX = 8;

export function players(app: App): Screen {
  const names: string[] = app.settings.players.length >= MIN ? [...app.settings.players] : ["", ""];
  const list = h("div", { class: "player-list" });
  const addBtn = h("button", { class: "secondary-btn", onclick: () => { if (names.length < MAX) { names.push(""); render(); } } }, "+ Add player");

  function render(): void {
    list.replaceChildren(
      ...names.map((name, i) =>
        h("div", { class: "player-row" },
          h("span", { class: "num" }, String(i + 1)),
          h("input", {
            type: "text", maxlength: "18", placeholder: `Player ${i + 1}`, value: name, "aria-label": `Player ${i + 1} name`,
            oninput: (e: Event) => { names[i] = (e.target as HTMLInputElement).value; },
          }),
          h("button", { class: "icon-btn small", "aria-label": `Remove player ${i + 1}`, disabled: names.length <= MIN, onclick: () => { names.splice(i, 1); render(); } }, "×"),
        ),
      ),
    );
    addBtn.disabled = names.length >= MAX;
  }
  render();

  const start = () => {
    const final = names.map((n, i) => n.trim() || `Player ${i + 1}`);
    app.settings.players = final;
    app.saveSettings();
    app.round = newRound(final.map((name) => ({ name, score: 0 })));
    app.round.current = newTurn(0);
    app.go("handoff");
  };

  const el = h("div", { class: "screen players" },
    h("h2", null, "Who's playing?"),
    h("p", { class: "lede" }, "Two to eight players. Names are optional; this is the play order."),
    list,
    addBtn,
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: start }, "Start"),
      h("button", { class: "text-btn", onclick: () => app.go("home") }, "Back"),
    ),
  );
  return { el };
}

export function handoff(app: App): Screen {
  const round = app.round!;
  const turn = round.current!;
  const name = round.players[turn.hotSeat].name;
  const el = h("div", { class: "screen handoff" },
    h("p", { class: "eyebrow" }, `Hot seat ${turn.hotSeat + 1} of ${round.players.length}`),
    h("h1", { class: "big" }, `Pass the phone to ${name}`),
    h("p", { class: "lede" }, "The detectives look away now. Only the hot seat sees the next screens."),
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: () => app.go("hotseat") }, `I'm ${name} — ready`),
      h("button", { class: "text-btn", onclick: () => app.go("home") }, "Quit round"),
    ),
  );
  return { el };
}

export function passback(app: App): Screen {
  const round = app.round!;
  const el = h("div", { class: "screen handoff" },
    h("h1", { class: "big" }, "Hand the phone to the detectives"),
    h("p", { class: "lede" }, `${round.players[round.current!.hotSeat].name}, you're done. Keep your face straight while they argue.`),
    h("div", { class: "actions" },
      h("button", { class: "primary-btn", onclick: () => app.go("vote") }, "We're the detectives"),
    ),
  );
  return { el };
}
