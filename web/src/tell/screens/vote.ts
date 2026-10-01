import type { App, Screen } from "../app.ts";
import { TIMING } from "../config.ts";
import { captions, meter } from "../components/meter.ts";
import { replay, replayStrip, windowFrames } from "../components/replay.ts";
import { shareFile } from "../components/share.ts";
import { h } from "../dom.ts";
import { applyScores, detectives, meterPick, newTurn, roomPick } from "../state.ts";

/** The detectives' screen: three meters animate up in sequence, then the votes. */
export function vote(app: App): Screen {
  const round = app.round!;
  const turn = round.current!;
  const results = turn.results ?? [null, null, null];
  const dets = detectives(round, turn);
  let voter = 0;
  let roomMode = dets.length > 2;
  const meters = [1, 2, 3].map((n) => meter(n, results[n - 1]));
  const cards = [1, 2, 3].map((n) =>
    h("button", { class: "vote-card", disabled: true, "data-testid": `vote-${n}`, onclick: () => cast(n) }, meters[n - 1].el, captions(results[n - 1])),
  );
  const who = h("h2", { class: "vote-who" }, "Watch the meters…");
  const sub = h("p", { class: "lede" }, "Tell score: how much the face moved away from its own baseline during each statement.");
  const modeBtn = h("button", { class: "text-btn", hidden: true, onclick: () => { roomMode = !roomMode; askNext(); } }, "");
  const el = h("div", { class: "screen vote" }, who, sub, h("div", { class: "vote-cards" }, ...cards), modeBtn);

  function askNext(): void {
    for (const c of cards) c.disabled = false;
    modeBtn.hidden = false;
    if (roomMode) {
      who.textContent = "Detectives, which one is false?";
      sub.textContent = "Argue it out, then one of you taps the room's pick.";
      modeBtn.textContent = "Vote one by one instead";
    } else {
      const name = round.players[dets[voter]].name;
      who.textContent = `${name}, which one is false?`;
      sub.textContent = `Vote ${voter + 1} of ${dets.length}. Picks stay hidden until everyone has voted.`;
      modeBtn.textContent = "Let the room vote together";
    }
  }

  function cast(n: number): void {
    if (roomMode) {
      turn.votes = [{ voter: -1, pick: n }];
      done();
      return;
    }
    turn.votes.push({ voter: dets[voter], pick: n });
    voter++;
    if (voter >= dets.length) done();
    else { app.toast("Vote in. Pass it on."); askNext(); }
  }

  function done(): void {
    for (const c of cards) c.disabled = true;
    modeBtn.hidden = true;
    who.textContent = "Votes are in";
    sub.textContent = `Hand the phone back to ${round.players[turn.hotSeat].name} for the reveal.`;
    el.append(h("div", { class: "actions" }, h("button", { class: "primary-btn", onclick: () => app.go("reveal") }, "Reveal")));
  }

  (async () => {
    for (const m of meters) await m.run(TIMING.meterMs);
    askNext();
  })();

  return { el };
}

/** The hot-seat player reveals the false statement; scores update; the leak replay plays. */
export function reveal(app: App): Screen {
  const round = app.round!;
  const turn = round.current!;
  const hot = round.players[turn.hotSeat];
  const el = h("div", { class: "screen reveal" });
  let rp: ReturnType<typeof replay> | null = null;

  function ask(): void {
    el.replaceChildren(
      h("h2", null, `${hot.name}, which one was false?`),
      h("p", { class: "lede" }, "Tap it. Then the room sees what the meter saw."),
      h("div", { class: "actions row3" }, ...[1, 2, 3].map((n) => h("button", { class: "primary-btn", "data-testid": `false-${n}`, onclick: () => choose(n) }, `#${n}`))),
    );
  }

  function choose(n: number): void {
    turn.falseOne = n;
    const { gained } = applyScores(round, turn);
    const mp = meterPick(turn.results);
    const rp0 = roomPick(turn.votes);
    const lines: string[] = [];
    if (mp === n && rp0 === n) lines.push(`The meter and the room agreed: #${n}.`);
    else {
      lines.push(mp === null ? "The meter had nothing to go on." : mp === n ? `The meter pointed at #${n}.` : `The meter pointed at #${mp}. The false one was #${n}.`);
      lines.push(rp0 === n ? "The room got it." : rp0 === null ? "The room was split." : `The room went for #${rp0}.`);
    }
    const deltas = Object.entries(gained).map(([i, g]) => `${round.players[Number(i)].name} +${g}`).join(" · ") || "No points this time.";
    const take = turn.statements[n - 1];
    const body = h("div", { class: "reveal-body" },
      h("h2", null, `The false one was #${n}`),
      h("p", { class: "lede", "data-testid": "verdict" }, lines.join(" ")),
      h("p", { class: "deltas" }, deltas),
    );
    const replayBox = h("div", { class: "replay-box" });
    const tabs = h("div", { class: "tabs-sm" }, ...[1, 2, 3].map((k) => h("button", { class: k === n ? "on" : "", "aria-pressed": k === n ? "true" : "false", onclick: (e: Event) => { for (const b of tabs.children) b.setAttribute("aria-pressed", "false"); (e.currentTarget as HTMLElement).setAttribute("aria-pressed", "true"); showReplay(k); } }, `#${k}`)));
    const saveBtn = h("button", { class: "secondary-btn", "data-testid": "save-replay", onclick: save }, "Save replay");
    const nextBtn = h("button", { class: "primary-btn", onclick: next }, turn.hotSeat + 1 < round.players.length ? "Next player" : "Scoreboard");
    el.replaceChildren(body, tabs, replayBox, h("div", { class: "actions" }, saveBtn, nextBtn));
    let shown = n;

    function showReplay(k: number): void {
      shown = k;
      rp?.stop();
      rp = null;
      const rk = turn.results?.[k - 1] ?? null;
      const tk = turn.statements[k - 1];
      if (!rk || rk.status !== "scored" || !tk || !tk.track.frames.length) {
        replayBox.replaceChildren(h("p", { class: "fine" }, rk && rk.status === "unscored" ? `No replay for #${k}: not scored (${rk.reason}).` : `No replay for #${k}.`));
        saveBtn.disabled = true;
        return;
      }
      saveBtn.disabled = false;
      rp = replay(tk.track, rk, rk.replayCaption);
      const extra = rk.captions.filter((c) => c !== rk.replayCaption).slice(0, 1);
      replayBox.replaceChildren(rp.el, ...extra.map((c) => h("p", { class: "cap" }, c)), h("p", { class: "fine" }, `Tell ${rk.score} · the 3 seconds with the most movement away from ${hot.name}'s baseline.`));
      rp.start();
    }

    async function save(): Promise<void> {
      const rk = turn.results?.[shown - 1];
      const tk = turn.statements[shown - 1];
      if (!rk || rk.status !== "scored" || !tk) return;
      try {
        const blob = await replayStrip(tk.track, rk, rk.replayCaption, hot.name);
        const how = await shareFile(blob, `tell-replay-${hot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${shown}.png`);
        app.toast(how === "shared" ? "Replay handed to the share sheet." : how === "downloaded" ? "Replay saved as a PNG strip." : "Not saved.");
      } catch {
        app.toast("Couldn't make the image.");
      }
    }
    if (take) showReplay(n);
    else replayBox.append(h("p", { class: "fine" }, "No replay."));
  }

  function next(): void {
    rp?.stop();
    app.recorder.clear();
    for (const s of turn.statements) s.track.frames.length = 0;
    if (turn.hotSeat + 1 < round.players.length) {
      round.turn = turn.hotSeat + 1;
      round.current = newTurn(round.turn);
      app.go("handoff");
    } else {
      app.go("roundend");
    }
  }

  ask();
  return { el, destroy: () => rp?.stop() };
}

export { windowFrames };
