# TELL — status after the build session (M0–M3)

Branch `claude/tell-m0-m3`, four commits (one per milestone). `npm run check`,
`npm run build` and `npm run e2e` (with the face clip) are green. Open points for you
are marked **→ you**.

## 1. What is done

| Milestone | Delivered |
|---|---|
| M0 Spine | `web/src/engine/recorder.ts` (SessionRecorder), `web/src/engine/tell.ts` (TellScorer, per-frame intensity, peak window, captions, quality gate, Poker Face scoring), `model/tell.json` with a schema check, `web/src/app/quality.ts`, the developer recorder in the Mien app (Settings → Developer), `tests/tell.test.ts` (spec §8 a–f and more), `tests/tell-golden.test.ts` on a synthetic fixture, `npm run golden:tell`, `npm run fixture:tell` |
| M1 Round | `web/tell.html` → `dist/tell.html`; screens 1–11 (home, privacy, players, hand-off, calibrate, baseline, statements, pass back, vote, reveal, scoreboard); Tell Meter animation; looping 0.5× mesh replay with heat-map and captions; PNG strip export; `tests/e2e/tell.spec.ts` plays a two-player round with the fake camera |
| M2 Solo | Poker Face daily (60 s, seeded provocations: lines, emoji bursts with a blip, mesh faces from the model's prototypes), straight-face score, streak, Wordle-style share card, `?fast=1` for tests, `tell.webmanifest`, service-worker precache (`mien-v2`), "Play TELL" link on the Mien start screen |
| M3 Honest | Science screen (`src/tell/content/science.ts`), settings, "Need ideas?" deck (`src/tell/content/decks.json`), copy audit `tests/tell-copy.test.ts` with an explicit allowlist of the only sentences that may use verdict or emotion words, `docs/tell/DECISIONS.md` |

Not done, by design: M4 (tuning on your fixtures), v1.1 modes, pixel replays, iOS.

**→ you**: review every line of user-facing copy (SPEC §9 M3 "copy reviewed by you").
The quickest route is the allowlist at the top of `web/tests/tell-copy.test.ts`, then the
screens in `web/src/tell/screens/*.ts` and `web/src/tell/content/*`.

## 2. How to test it on a phone

Hosting is still your decision (HANDOFF §1). Until then, test from your LAN:

```sh
cd web && npm install
npm run dev:https          # prints https://<your-LAN-IP>:5173
```

On the phone (same Wi-Fi) open `https://<your-LAN-IP>:5173/tell.html`, accept the
self-signed certificate, allow the camera. For the production build:

```sh
npm run build && npx vite preview --host     # http://<LAN-IP>:4173/tell.html (camera needs https or localhost)
```

What to try (HANDOFF §5):
1. **A round with 3 people.** Home → Play with friends → privacy → names → hand-off →
   calibrate → baseline (12 s, talk) → three statements (tap, say it, tap; 15 s max) →
   pass back → the meters animate → vote → reveal → replay → next player → scoreboard.
   Note where the quality badge complains ("Come closer", "Move to the light", "Face the
   phone", "Where did you go?") and whether a deliberately held stare or a leaked smile
   moves the meter more than normal talking.
2. **Poker Face** from Home. Sixty seconds; the share card copies to the clipboard or
   opens the share sheet.
3. **Install**: Safari share sheet → Add to Home Screen (or Chrome → Install app). The
   installed app opens `tell.html` and loads offline on the second launch. If an
   earlier Mien install is cached, reload once so the `mien-v2` cache takes over.
4. **Replay export**: Reveal → Save replay → a PNG strip of six mesh frames goes to the
   share sheet (phones) or downloads (desktop).

The Mien instrument is still at `/` (or `index.html`); its start screen links to TELL.

## 3. Placeholders pending real fixtures (M4)

Every number in `model/tell.json` is a first guess; the synthetic fixture pins the
behaviour, it does not justify it. In order of expected impact:

| Parameter | Now | Why it is a guess |
|---|---|---|
| `blink.lo / blink.hi` (smoothstep edges of the longest-open ratio) | 1.0 / 2.0 | Chosen so the spec's test (b) passes (see DECISIONS). Real talking baselines may have longer open stretches than a 3 s blinker, which would make 2.0 too sensitive or too lax. |
| `blink.ibiFactor` | 1.5 | Floor for very regular blinkers; untested on people. |
| `leakScale` | 0.3 | AU12/AU6 excess over P90 that counts as a full leak. MediaPipe's smile channel is strong, so 0.3 may be too easy to reach while talking. |
| `asymScale` | 0.3 | AU12U/AU14U/AU2U carry a noise floor (`asymmetry.noise` 0.08 in the engine); the right scale depends on how asymmetric normal talking is. |
| `weights` | 0.35 / 0.25 / 0.15 / 0.15 / 0.10 / 0 | Spec defaults. Freeze stays 0 until fixtures show it separates anything. |
| `display.curve` | 0.8 | Cosmetic; tune so a normal statement reads 5–20 and a strong tell 60+. |
| `intensity.peakMin` | 0.15 | Threshold for "Nothing much leaked." vs a real peak window. |
| `baseline.grow` | true | Leave-one-out baseline; compare with `false` on labelled rounds. |
| `quality.minMean` 0.5, `quality.minFaceSec` 3 | spec | Check how often real statements get "unscored" in a living room. |
| `pokerface.scale` 8 AU·s, `binLevels` 0.12 / 0.5 / 1.2 | guess | Should make a genuinely straight face score 90+ and a giggle 40–70. |
| `quality.ts` thresholds (size 0.12→0.25, light 40→90, pose 20°→35°) | spec | Luminance comes from the forehead crop, not the whole face. |

The M4 workflow: put your recordings in `model/fixtures/tell/`, run `npm run golden:tell`
to see every statement's components next to the `false:N` label, adjust `tell.json`,
re-run, commit the fixtures (private repo, numbers only) and the regenerated
`golden-tell.json`, and write the short weights note the spec asks for.

## 4. Recording fixtures with the developer recorder (exact steps)

The recorder lives in the Mien instrument, not in TELL, because it needs the raw
measurements (TELL only keeps AUs). It saves numbers only: blendshapes, landmark
geometry, forehead texture values and head pose per frame. No pixels, ever.

1. Open the Mien app on the phone over https (`/index.html`), **Start camera**, and
   calibrate your neutral face if the status chip says "Tap to calibrate" (the
   calibration is embedded in the file so the replay reproduces it). Skip the range
   calibration; TELL does not use it.
2. Gear icon → **Developer** → **Record measurements**. A small bar appears on the
   camera view: frames/seconds, and the markers.
3. Play a real round with the phone in the hot-seat position:
   - tap **Baseline**, then talk for 10–15 s (name, breakfast);
   - tap **Statement 1**, say it, tap **End**; the button advances to Statement 2 and 3
     by itself (tap **End** after each);
   - tap the **False one** button (#1, #2 or #3) for the statement that was false.
   For a Poker Face session tap **Feed** instead, hold a straight face for 60 s while
   someone provokes you, tap **End**.
4. Tap **Save**. Keep the suggested name (`tell-YYYY-MM-DD-HHMM.json`) or type a
   descriptive one such as `maya-round1`. On iPhone and Android the share sheet opens:
   send it to yourself (AirDrop, Files, mail). On a computer the file downloads.
5. Repeat for ≥ 10 sessions across 2–3 friends, in the rooms you actually play in
   (one in dim light on purpose). One recording per hot seat is ideal; a file with
   several rounds works too but only the last `false:N` marker is used per file, so
   prefer one hot seat per file.
6. Copy the files into `model/fixtures/tell/` and run:

   ```sh
   cd web && npm run golden:tell
   ```

   It prints, per file, the false statement and each statement's score or
   "unscored" reason, and rewrites `model/fixtures/tell/golden-tell.json`. Commit both.

Marker reference inside the files (`cmd` on a frame): `calibrate:3`, `baseline`,
`statement:1..3`, `feed`, `end`, `false:N`. A file is a `sequences.json`-style object:
`{ name, platform: "mediapipe", calibration?, gains?, frames: [{ t, m, cmd? }] }`.
The files hold numbers, not video, so they cannot be played back in Mien's "Analyze a
video file"; `replayFixture()` in `web/scripts/make-golden-tell.ts` is the way to inspect
one (it returns the recorder segments).

## 5. Known limits worth knowing before the first party

- The hot-seat player's phone must be held in portrait, face filling at least a quarter
  of the frame height, in reasonable light; otherwise the button says what to fix and
  recording does not start.
- The talking baseline cannot be skipped (SPEC §7). A saved calibration can be reused
  ("That's me"); it belongs to the phone, so a second player must tap "Calibrate again".
- Replays are mesh-only (face points) and live in memory until the next player.
- The round e2e needs a face clip (`FAKE_VIDEO`); the camera-free test covers the rest.
- GitHub Pages will not deploy from this private repository; the deploy job already
  skips when Pages is disabled.
