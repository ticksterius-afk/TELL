import type { Segment } from "../engine/recorder.ts";
import type { TellResult } from "../engine/tell.ts";

/** One frame of face points kept in memory for the leak replay (never stored). */
export interface MeshFrame {
  t: number;
  /** 478 landmarks as [x0, y0, x1, y1, …] normalised to the video frame. */
  xy: Float32Array;
  regions: Record<string, number>;
}

export interface MeshTrack {
  width: number;
  height: number;
  mirrored: boolean;
  frames: MeshFrame[];
}

export interface Player {
  name: string;
  score: number;
}

export interface StatementTake {
  n: number;
  segment: Segment;
  track: MeshTrack;
}

export interface Vote {
  /** Player index of the detective, or -1 for the whole room. */
  voter: number;
  /** Statement number 1–3. */
  pick: number;
}

export interface Turn {
  hotSeat: number;
  baseline: Segment | null;
  statements: StatementTake[];
  results: TellResult[] | null;
  votes: Vote[];
  falseOne: number | null;
}

export interface Round {
  players: Player[];
  /** Index into players of the player currently in the hot seat. */
  turn: number;
  current: Turn | null;
}

export function newRound(players: Player[]): Round {
  return { players: players.map((p) => ({ name: p.name, score: 0 })), turn: 0, current: null };
}

export function newTurn(hotSeat: number): Turn {
  return { hotSeat, baseline: null, statements: [], results: null, votes: [], falseOne: null };
}

export function detectives(round: Round, turn: Turn): number[] {
  return round.players.map((_, i) => i).filter((i) => i !== turn.hotSeat);
}

/** Highest-scoring scored statement, or null when nothing was scored. */
export function meterPick(results: TellResult[] | null): number | null {
  if (!results) return null;
  let best: number | null = null;
  let score = -1;
  results.forEach((r, i) => {
    if (r.status === "scored" && r.score > score) {
      score = r.score;
      best = i + 1;
    }
  });
  return best;
}

/** Majority of the votes (ties → null). */
export function roomPick(votes: Vote[]): number | null {
  const tally = [0, 0, 0, 0];
  for (const v of votes) tally[v.pick]++;
  const max = Math.max(...tally);
  if (max === 0) return null;
  const winners = [1, 2, 3].filter((n) => tally[n] === max);
  return winners.length === 1 ? winners[0] : null;
}

/**
 * Scoring (SPEC §5 step 10): every detective who picked the false statement
 * +1; the hot-seat player +1 for every detective fooled. A room vote counts
 * once per detective.
 */
export function applyScores(round: Round, turn: Turn): { gained: Record<number, number> } {
  const f = turn.falseOne;
  const gained: Record<number, number> = {};
  if (f === null) return { gained };
  const dets = detectives(round, turn);
  const roomVote = turn.votes.find((v) => v.voter === -1);
  for (const d of dets) {
    const v = turn.votes.find((x) => x.voter === d) ?? roomVote;
    const right = v?.pick === f;
    if (right) gained[d] = (gained[d] ?? 0) + 1;
    else gained[turn.hotSeat] = (gained[turn.hotSeat] ?? 0) + 1;
  }
  for (const [i, g] of Object.entries(gained)) round.players[Number(i)].score += g;
  return { gained };
}

export function scoreboardText(round: Round): string {
  const sorted = [...round.players].sort((a, b) => b.score - a.score);
  return ["TELL scoreboard", ...sorted.map((p, i) => `${i + 1}. ${p.name} — ${p.score}`), "It can't catch lies. Nobody can. It catches tells."].join("\n");
}
