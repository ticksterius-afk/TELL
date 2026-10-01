/** Timings. `?fast=1` compresses the long waits so the end-to-end test runs in seconds. */
const params = new URLSearchParams(location.search);
export const FAST = params.get("fast") === "1";
export const VERSION = "0.1.0";

export const TIMING = {
  calibrationSec: 3,
  baselineSec: FAST ? 4 : 12,
  /** The baseline may be stopped by hand after this many seconds. */
  baselineMinSec: FAST ? 2 : 8,
  statementMaxSec: 15,
  statementMinSec: FAST ? 0.5 : 1.5,
  /** Face lost for longer than this pauses the ring. */
  faceLostMs: 1500,
  meterMs: FAST ? 300 : 1200,
  pokerSec: FAST ? 3 : 60,
  pokerBaselineSec: FAST ? 1 : 5,
  pokerBinSec: FAST ? 0.3 : 6,
  pokerProvocationMinSec: FAST ? 0.4 : 4,
  pokerProvocationMaxSec: FAST ? 0.7 : 6,
  /** Replay speed (0.5 = slow motion). */
  replaySpeed: 0.5,
};

/** Day number of the Poker Face daily: days since 2026-10-01 (local date). */
export function pokerDayNumber(d = new Date()): number {
  const epoch = Date.UTC(2026, 9, 1);
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((today - epoch) / 86_400_000);
}
