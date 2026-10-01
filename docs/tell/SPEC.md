# TELL — specification

Private repository. The engine, web app and iOS app in this repository are the base; TELL is built here as a second entry point of the web app (see §3). The handoff for the build session is in [HANDOFF.md](HANDOFF.md); the product reasoning is in [../CONCEPTS.md](../CONCEPTS.md).


## 1. Product in one paragraph

TELL is a pass-the-phone party game built on the Mien expression engine. A player in
the hot seat says three things about themselves, one false. The phone measures how
much their face *deviated from their own baseline* during each statement (blink
suppression, a smile leaking through, surprise brows, one-sided movements, brief
expressions) and shows a **Tell Meter** per statement. The room votes, the player
reveals, and the phone replays the 3 seconds with the biggest tell as a slow-motion
muscle heat-map. Between parties, a solo **Poker Face** daily keeps the app installed:
60 seconds of provocations, keep a straight face, share a spoiler-free leakage grid.
The app never says "lie" or "truth". It says "tell", shows the measurement, and tells
you what the science can and cannot do.

## 2. Goals and non-goals

Goals (v1)
- Playable in a room with zero explanation, on a phone browser (web PWA), in under 60
  seconds from opening the link.
- A live, visibly responsive meter that is *real* (every number traces to engine output).
- The leak replay as the shareable moment (mesh-only in v1, pixels opt-in in v1.1).
- Solo Poker Face daily with a streak and a text share card.
- Honest framing everywhere: tells, not lies; movement vs your own baseline.
- Reuse the engine unchanged; all new engine code is platform-independent and
  unit-tested so it can be ported to Swift later.

Non-goals (v1)
- No accounts, no server, no uploads, no analytics that leave the device.
- No native iOS build (the engine is already ported; TELL's iOS UI is v2).
- No claims of accuracy. No "detective training" claims (training does not transfer
  to lie detection: Jordan et al. 2019).
- No Interrogation, Fake It or Stare-down modes (v1.1).

## 3. Repository placement

Add TELL as a second entry point of the existing Vite app, sharing the engine,
tracker, camera and calibration code:

```
web/
  tell.html                      second page (Vite multi-page: build.rollupOptions.input)
  src/tell/
    main.ts                      app shell, routing between screens
    screens/                     home, privacy, players, hotseat, vote, reveal, pokerface, science, settings
    components/                  meter, replay canvas, share card, quality badge
    content/decks.json           prompts ("need ideas?") and Poker Face provocations
    styles.css
  src/engine/
    recorder.ts                  SessionRecorder (new, platform-independent)
    tell.ts                      TellScorer (new, platform-independent)
  src/app/quality.ts             tracking-quality estimate (face size, light, pose)
model/
  tell.json                      TellScorer parameters (weights, windows, thresholds)
  fixtures/tell/                 recorded labelled sessions (measurements only) + golden tell scores
web/tests/
  tell.test.ts                   unit tests for recorder and scorer
  tell-golden.test.ts            scorer output on recorded fixtures
  e2e/tell.spec.ts               full round with the fake camera
```

Built to `web/dist/tell.html` (add a `tell.html` precache entry in `public/sw.js`).
Hosting: this repository is private, and GitHub Pages on a private repository needs a paid
GitHub plan, so the existing Pages deploy job will not work here; see HANDOFF §1. The Mien instrument app stays as is; add one
"Play TELL" link on its start screen.

Keep `main.ts`'s calibration and range-calibration logic reusable: extract the pieces
TELL needs (neutral calibration with ring, saved calibration/gains keys) into
`src/app/calibration.ts` and have both entry points import it. Do not change engine
outputs; `npm run check` and the golden tests must stay green.

## 4. Engine additions

### 4.1 `SessionRecorder` (`web/src/engine/recorder.ts`)

Records engine output per frame into labelled segments. Input is the existing
`FrameResult` (no new engine state).

```ts
interface RecordedFrame { t: number; face: boolean; aus: Record<string, number>; pose: {pitch,yaw,roll}; still: number }
interface Segment { id: string; kind: "baseline" | "statement" | "feed"; t0: number; t1: number | null; frames: RecordedFrame[]; blinks: number[]; micro: {t,id,peak,durationMs}[] }

class SessionRecorder {
  constructor(auIds: string[])                     // which AU channels to keep (default list below)
  begin(id: string, kind: Segment["kind"], t: number): void
  push(r: FrameResult): void                        // appends to the open segment; copies r.events blink/micro with timestamps
  end(t: number): Segment
  segments(): Segment[]
  toJSON(): SessionDump                             // measurements-free: AUs, events, pose only
}
```

Default AU set kept per frame: AU1, AU2, AU4, AU5, AU6, AU7, AU9, AU10, AU12, AU12L,
AU12R, AU12U, AU14, AU14U, AU15, AU17, AU20, AU23, AU24, AU25, AU26, AU2U, AU43,
STILL. Memory budget: 60 fps × 25 values × 120 s ≈ fine.

### 4.2 `TellScorer` (`web/src/engine/tell.ts`), parameters in `model/tell.json`

Compares a statement segment with the session baseline. Everything is relative to
that person, that session, that lighting.

Baseline statistics (computed once from the baseline segment, updated with every
segment that is *not* being scored if `tell.json.baseline.grow` is true):
- per AU channel: median and P90 of the baseline frames;
- blink: median inter-blink interval (IBI) and the longest eyes-open stretch;
- brief-expression rate per minute.

Components for a statement segment `S` (each clamped to [0, 1]):

| id | Name shown | Computation | Literature |
|---|---|---|---|
| `blink` | Blink suppression | `longestOpen(S) / max(longestOpenBaseline, ibiMedianBaseline×1.5)` mapped by smoothstep(1.0, 2.5) | Leal & Vrij 2008; Perelman 2014 |
| `leak12` | Smile leak | time-weighted mean of max(0, AU12 − P90base(AU12)) / `leakScale`, plus 0.5× the same for AU6 | ten Brinke & Porter 2012 |
| `brows` | Surprise brows | mean of max(0, (AU1+AU2)/2 − P90base) / `leakScale` | ten Brinke & Porter 2012 (failed sadness) |
| `asym` | One-sided movement | mean of max(0, max(AU12U, AU14U, AU2U) − P90base) / `asymScale` | Ekman, Hager & Friesen 1981 |
| `micro` | Brief expressions | count in S, normalised by `microPerStatement` (default 1) | Porter & ten Brinke 2008 (rare; low weight) |
| `freeze` | Stillness | max(0, mean(STILL in S) − mean(STILL base)) / 0.3 | DePaulo 2003 (liars move less); weight 0 by default |

Default weights (`tell.json.weights`): blink 0.35, leak12 0.25, brows 0.15, asym 0.15,
micro 0.10, freeze 0. Tell score = `100 × clamp(Σ w_i c_i / Σ w_i, 0, 1)`, then a
display curve `score^0.8` so small real deviations are visible.

Per-frame **tell intensity** (for the live meter animation and the replay peak):
`clamp(0.5·leakFrame + 0.3·asymFrame + 0.2·browFrame, 0, 1)` smoothed with τ = 250 ms,
plus a step of +0.3 that decays over 1 s on each brief-expression event. The blink
component has no per-frame form; it shows as a "held eyes open for 6.2 s" chip.

**Peak window**: the 3-second window of S with the highest mean intensity; if no
frame exceeds 0.15, the replay window is the statement's middle 3 seconds and the
caption says "Nothing much leaked."

**Captions** (templated, max two): choose the two largest components above 0.25.
Examples: "Held eyes open 2.6× longer than usual", "Left lip corner pulled at 4.1 s",
"Brows rose while saying it", "Cheeks lifted (a smile leaking through)". Never the
words lie, lying, truth, honest, deception.

Quality gate: a statement with < 3 s of face frames, or with mean quality < 0.5
(§4.3), is marked `unscored` with the reason ("too short", "too dark", "face out of frame").

Parameters live in `model/tell.json` with a `version`, validated by a small schema
test (`tests/tell.test.ts`) and copied to iOS later like `emotion-model.json`.

### 4.3 Tracking quality (`web/src/app/quality.ts`)

Per frame, from the tracker: `size` (face box height / frame height, smoothstep
0.12→0.25), `light` (mean luminance of the face crop, available via the existing
texture crop path, smoothstep 40→90 of 255), `pose` (1 within 20° yaw/pitch of
baseline, 0 at 35°). `quality = min(size, light, pose)`. Shown as a small badge during
recording ("Move to the light", "Come closer", "Face the phone"). Also exported on
`window.__tell` for the e2e test.

### 4.4 Dev recorder (in the Mien app, behind Settings → "Developer")

"Record measurements" writes a `sequences.json`-compatible file (`{name, platform,
frames:[{t, m, cmd?}]}`) of raw measurements for the current camera session, with
`cmd` markers the user inserts by tapping ("baseline", "statement:1", "lie:2", …).
Numbers only, no pixels. These files become `model/fixtures/tell/*.json` and drive
the scorer's golden tests and tuning. The build session cannot use a camera, so this
is how the human feeds it real faces (see HANDOFF.md §5).

## 5. Screens and flow (v1)

All screens are mobile portrait first, large type, dark theme consistent with Mien.

1. **Home**: "TELL — the poker-face party game". Buttons: *Play with friends*, *Poker
   Face (daily)*, *How it works*, settings gear. One line under the title: "It can't
   catch lies. Nobody can. It catches tells."
2. **Privacy** (first run, before the camera permission): "Everything stays on this
   phone. No video is uploaded, ever. Replays are drawn from face points and are not
   saved unless you tap Save." Then the browser permission prompt.
3. **Players**: add 2–8 names (optional; defaults Player 1…). Order is play order.
4. **Hot seat hand-off**: full-screen "Pass the phone to Maya". Tap when ready.
5. **Calibrate** (reuse Mien's 3-second neutral calibration, restyled: "Look at the
   phone and relax your face"). Skipped if a calibration for this device exists and the
   player taps "That's me"; otherwise required. Range calibration is *not* used in TELL.
6. **Baseline** (10–15 s): "Tell us your name and what you had for breakfast." Recording
   ring, quality badge. This is a *talking* baseline on purpose (mouth AUs move while
   speaking; statements are compared with talking, not with silence).
7. **Statements 1, 2, 3**: "Statement 1. Tap, say it, tap." Max 15 s each. The hot-seat
   player sees only the ring and the quality badge, never the meter. "Need ideas?"
   opens three prompt cards from `decks.json`.
8. **Pass back**: "Hand the phone to the detectives." Tap.
9. **Vote**: three cards with the Tell Meter per statement animating up from zero in
   sequence (1.2 s each, the suspense beat), captions under each. Each detective taps
   the statement they think is false (names cycle), or the room just argues and one
   tap records the group's pick. Hidden until all votes are in.
10. **Reveal**: the hot-seat player taps which statement was false. Scoring: each
    detective who picked it +1; the hot-seat player +1 for every detective fooled.
    Then: "The meter pointed at #2. The false one was #3." or "The meter and the room
    agreed." Then the **leak replay** of the false statement: 3-second slow-motion (0.5×)
    landmark mesh with region heat-map and captions, looping. Buttons: *Save replay*
    (v1: PNG strip of 6 frames; v1.1: MP4 with pixels, opt-in), *Next player*.
11. **Round end** after all players: scoreboard, "Play again", "Share scoreboard" (text).
12. **Poker Face**: see §6.
13. **Science** ("How it works"): one card per component with the real citation and a
    plain sentence on effect size; the 54% figure (Bond & DePaulo 2006); "What we don't
    score and why: gaze aversion, fidgeting (no effect in 158-cue meta-analysis)".
14. **Settings**: recalibrate, forget calibration, mirror, developer recorder, "Reset
    Poker Face streak", version.

Interaction rules
- Any screen with the camera shows the quality badge; recording cannot start below
  quality 0.5 (the button says what to fix).
- Face lost for > 1.5 s during a statement pauses the ring with "Where did you go?".
- The meter animation uses the final score; no live meter is ever shown to the hot-seat player.

## 6. Poker Face (solo daily)

- 60 seconds. The screen throws provocations at the player every 4–6 s from a daily
  seeded list: short absurd lines, emoji bursts with sound, and the Mien "mesh face"
  pulling the 43 prototype expressions at the player (rendered from the model's
  prototypes, so no licensed content is needed). Content lives in `decks.json`
  (`pokerface` section) and is easy to extend.
- Score: leakage = time-weighted integral of max over {AU12, AU6, (AU1+AU2)/2, AU26,
  AU9, AU20} of (value − P90 of the first 5 s baseline − 0.05), scaled to 0–100 by
  `tell.json.pokerface.scale`. Lower is better; show as "Straight-face 87".
- Streak: consecutive days played (local storage, date-based; no freeze in v1).
- Share card (text, Wordle-style): `TELL Poker Face #142  87/100 🔥 6` plus 10 cells
  for the 10 six-second bins: ⬛ no leak, 🟨 small, 🟧 medium, 🟥 big. Uses
  `navigator.share` when available, else copies to clipboard.
- The daily number is `floor((today − 2026-10-01) / 1 day)`; the seed is that number.

## 7. Copy and policy guard-rails (hard requirements)

- The words "lie detector" never appear as a claim. Allowed: "It can't catch lies.
  Nobody can (people score 54%)". Scoring UI uses "tell" only.
- No emotion labels in scores or captions ("you looked afraid" is forbidden; "brows
  rose" is fine). The Science screen may name emotions when citing papers.
- The baseline step cannot be skipped; it is the mechanic.
- Terms/How-it-works state: not for hiring, interviews, school, work, or deciding
  whether someone is truthful. For fun between consenting players.
- No upload, no analytics, no third-party scripts. Replays are mesh-only unless the
  player taps Save (v1.1 pixel replays need a second explicit consent screen).
- A visible recording indicator whenever frames are being analysed.

## 8. Tests and acceptance

Automated (must pass in CI, `npm run check` + `npm run e2e`):
- `tell.test.ts`: scorer on synthetic segments: (a) identical to baseline → score < 10;
  (b) no blinks for 8 s with baseline IBI 3 s → blink component ≥ 0.8; (c) AU12 0.3
  over baseline for half the segment → leak12 ≈ 0.5±0.1; (d) too short/dark → unscored;
  (e) captions never contain forbidden words (assert against a word list);
  (f) `tell.json` schema and version.
- `tell-golden.test.ts`: scorer output on `model/fixtures/tell/*.json` matches
  `golden-tell.json` (regenerated by `npm run golden:tell`).
- `e2e/tell.spec.ts`: with the fake camera clip (same setup as `app.spec.ts`): home →
  privacy → players → calibrate → baseline → 3 statements (3 s each) → vote → reveal
  shows three meters with numbers and a replay canvas drawing frames; Poker Face runs
  60 s (use a `?fast=1` query that compresses timers to 3 s) and produces a share string
  with 10 cells; no page errors.
- Typecheck, model format check, existing golden tests unchanged.

Manual acceptance (by you, with a phone; see HANDOFF.md §5):
- A real round with 3 people takes under 6 minutes including calibration.
- The meter visibly differs between a deliberately held stare and normal talking.
- Nobody in the test group reads the UI as claiming to detect lies.
- Works in a normally lit living room on an iPhone in Safari and an Android phone in
  Chrome; "Add to Home Screen" works; the page loads offline afterwards.

## 9. Milestones for the build session

| M | Deliverable | Done when |
|---|---|---|
| M0 Spine | `recorder.ts`, `tell.ts`, `model/tell.json`, `quality.ts`, dev recorder in Mien, unit tests, golden script | `npm run check` green; a synthetic session scores sensibly |
| M1 Round | `tell.html` + screens 1–11, meter, mesh replay, PNG strip | e2e round passes; `npm run build` produces `dist/tell.html` (hosting is a separate decision, see HANDOFF §1) |
| M2 Solo | Poker Face, streak, share card, PWA precache, Mien start-screen link | e2e Poker Face passes; installable |
| M3 Honest | Science screen, copy audit test, settings, "need ideas?" deck | forbidden-word test green; copy reviewed by you |
| M4 Tune | Scorer re-tuned on your recorded fixtures (≥ 10 labelled sessions) | golden fixtures committed (private) and weights justified in a short note |
| v1.1 | Pixel replay export (MediaRecorder → share sheet), Interrogation, Fake It, Stare-down | separate spec addendum |
| v2 | iOS: Swift port of recorder + scorer with parity tests; SwiftUI screens | parity test on tell fixtures |

Decisions already made (do not reopen in the build session): web first; mesh-only
replays in v1; no accounts; Vite multi-page in the same project; parameters in
`model/tell.json`; the talking baseline.

Defaults for open points (change if you disagree): names optional; 15 s max per
statement; 3 statements fixed; scoring as in §5 step 10; dark theme; English only.

---
