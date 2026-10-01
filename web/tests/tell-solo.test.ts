import { describe, expect, it } from "vitest";
import { model } from "./helpers.ts";
import decks from "../src/tell/content/decks.json";
import { applyScores, meterPick, newRound, newTurn, roomPick, scoreboardText } from "../src/tell/state.ts";
import { pokerDayNumber } from "../src/tell/config.ts";
import { bumpStreak, dailyFeed, shareCard } from "../src/tell/screens/pokerface.ts";
import { prototypeAUs } from "../src/tell/components/meshface.ts";

describe("Poker Face daily", () => {
  it("numbers the daily from 2026-10-01", () => {
    expect(pokerDayNumber(new Date(2026, 9, 1, 12))).toBe(0);
    expect(pokerDayNumber(new Date(2026, 9, 2, 0, 30))).toBe(1);
    expect(pokerDayNumber(new Date(2027, 0, 1))).toBe(92);
  });

  it("builds a Wordle-style share card with ten cells", () => {
    const card = shareCard(142, { straightFace: 87, levels: [0, 0, 1, 2, 3, 0, 0, 1, 0, 0] }, 6);
    expect(card).toBe("TELL Poker Face #142  87/100 🔥 6\n⬛⬛🟨🟧🟥⬛⬛🟨⬛⬛");
    expect([...card.split("\n")[1]]).toHaveLength(10);
  });

  it("counts consecutive days as a streak and keeps the best", () => {
    let s = bumpStreak(null, 10);
    expect(s).toEqual({ last: 10, count: 1, best: 1 });
    s = bumpStreak(s, 10); // same day again: unchanged
    expect(s.count).toBe(1);
    s = bumpStreak(s, 11);
    s = bumpStreak(s, 12);
    expect(s.count).toBe(3);
    s = bumpStreak(s, 14); // missed a day
    expect(s).toEqual({ last: 14, count: 1, best: 3 });
  });

  it("seeds the same feed for the same day and uses only known expressions", () => {
    const a = dailyFeed(5);
    const b = dailyFeed(5);
    expect(a).toEqual(b);
    expect(dailyFeed(6)).not.toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(model.expressions.map((e) => e.id));
    for (const f of decks.pokerface.faces) expect(ids.has(f), f).toBe(true);
    for (const f of a) if (f.kind === "face") expect(ids.has(f.id)).toBe(true);
  });

  it("derives the mesh face pose from the model's prototypes", () => {
    expect(prototypeAUs("happiness").AU12).toBeGreaterThan(0.5);
    expect(prototypeAUs("surprise").AU1).toBeGreaterThan(0.5);
    expect(prototypeAUs("surprise").AU26 ?? prototypeAUs("surprise").AU27 ?? prototypeAUs("surprise").AU5).toBeGreaterThan(0);
    expect(Object.keys(prototypeAUs("nope"))).toEqual([]);
  });

  it("keeps every core action of a prototype at full strength even when a support slot lists it too", () => {
    for (const e of model.expressions) {
      const v = e.variants?.[0] ?? { slots: e.slots ?? [] };
      const got = prototypeAUs(e.id);
      for (const s of v.slots ?? []) for (const f of s.any.slice(0, 2)) expect(got[f.replace(/[LRUB]$/, "")], `${e.id} ${f}`).toBe(0.9);
    }
  });
});

describe("round scoring", () => {
  it("gives detectives +1 for a right pick and the hot seat +1 per fooled detective", () => {
    const round = newRound([{ name: "Maya", score: 0 }, { name: "Tom", score: 0 }, { name: "Ana", score: 0 }, { name: "Bo", score: 0 }]);
    const turn = newTurn(0);
    turn.votes = [{ voter: 1, pick: 3 }, { voter: 2, pick: 2 }, { voter: 3, pick: 3 }];
    turn.falseOne = 3;
    const { gained } = applyScores(round, turn);
    expect(gained).toEqual({ 1: 1, 3: 1, 0: 1 });
    expect(round.players.map((p) => p.score)).toEqual([1, 1, 0, 1]);
    expect(roomPick(turn.votes)).toBe(3);
  });

  it("a room vote counts once per detective", () => {
    const round = newRound([{ name: "A", score: 0 }, { name: "B", score: 0 }, { name: "C", score: 0 }]);
    const turn = newTurn(1);
    turn.votes = [{ voter: -1, pick: 1 }];
    turn.falseOne = 2;
    applyScores(round, turn);
    expect(round.players.map((p) => p.score)).toEqual([0, 2, 0]);
    expect(roomPick([{ voter: 0, pick: 1 }, { voter: 2, pick: 2 }])).toBeNull();
  });

  it("the meter picks the highest scored statement and the scoreboard text has no verdict words", () => {
    const base = { captions: [], chips: [], replayCaption: "", intensity: [], details: [], faceSec: 5, qualityMean: 1 } as unknown as import("../src/engine/tell.ts").TellResult;
    expect(meterPick([{ ...base, status: "scored", score: 10 }, { ...base, status: "unscored", score: 0 }, { ...base, status: "scored", score: 40 }])).toBe(3);
    expect(meterPick([{ ...base, status: "unscored", score: 0 }])).toBeNull();
    const round = newRound([{ name: "Maya", score: 2 }, { name: "Tom", score: 0 }]);
    round.players[0].score = 2;
    expect(scoreboardText(round)).toContain("1. Maya — 2");
  });
});
