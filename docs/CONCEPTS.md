# Product concepts: education, "lie detector", game

Three directions for turning Mien's engine into a product that is unique, sticky and
cool, each grounded in (a) what the engine actually measures well, (b) what shipped
before and why it lived or died, and (c) what the science allows you to claim.

Sources are listed at the end. Numbers from secondary sources are marked "reported".

---

## 0. Executive summary

| | Education: **Expressionist** | Lie detector: **TELL** | Game: **Lights Off** |
|---|---|---|---|
| One line | Duolingo for faces: learn to *read* and *make* every expression, graded muscle by muscle | The honest lie-detector party game: it can't catch lies (nobody can), but it catches **tells** | A horror game that watches you back: it moves when you blink and feeds on your fear |
| Why unique | No consumer app does camera-based *production* training with FACS feedback | Every "lie detector" app is a fake; every deception *game* (Imposter, Traitors) has no sensor | No shipped game scores genuine emotion (Duchenne, fear AUs, blink events); works in total darkness on iPhone |
| Sticky loop | Daily 90-second "Face of the Day", AU mastery tree, friend streaks | Occasion-based (parties) + a solo daily "poker face" drill between parties | Nightly roguelike run + the shareable reaction clip |
| Viral unit | Spoiler-free AU heat-map share card (no photo) | 3-second slow-mo "leak replay" with muscle heat-map | Your own face at the jump-scare moment (opt-in reaction reel) |
| Engine fit today | 85% there (prototypes, explanations, calibration, range) | 80% (blink events, Duchenne/polite pair, AU asymmetry, brief expressions) | 70% (blink, AU5/AU1+2+4/AU20, PERCLOS, stillness; needs a game loop) |
| Regulatory heat | Low if sold to individuals, not schools or employers (EU AI Act Art. 5) | Medium: never claim truth detection (Apple 1.1.6, Play "misleading claims") | Low |
| Recommendation | Build second (shares 60% of TELL's UI) | **Build first** | Build third, or as a mode inside TELL's app |

The three share one spine, so the order matters less than starting: a **target-face
matcher** (distance between live AUs and a prototype), a **session recorder** (AU
timelines with replay), a **share card renderer**, and a **tracking-confidence /
occlusion flag**. Build those once.

---

## 1. What you already have (audit)

This is not "just basics". It is an unusually strong foundation, and most of what the
three concepts need already exists in the engine.

### Strengths that matter for a product

| Capability | Where | Why it matters for the concepts |
|---|---|---|
| FACS Action Units, per side (AUnL/R), one-sidedness (AUnU), symmetric minimum (AUnB) | `web/src/engine/scoring.ts` | Muscle-level inputs and scoring. No consumer face game ships with AU-level data. |
| 43 expression prototypes in 6 tiers, each with slot-by-slot explanations (`explainExpression`) and citations | `model/emotion-model.json`, "Why" tab | Ready-made teaching content: every label can show *which muscles* and *which paper*. |
| Personal neutral calibration + adaptive baselines + personal range calibration (gain per signal) | `web/src/engine/baseline.ts` | The main reason face games fail is "it never detects *my* face". Solved. |
| Felt (Duchenne) vs polite smile as an exclusive pair | model `display.exclusive` | The one deception-adjacent signal with real literature behind it. |
| Brief ("micro") expression detector (65–500 ms, no-blink gate), blink events with durations, blink rate, PERCLOS, yawn, head stillness | `web/src/engine/temporal.ts` | Timing signals: reaction games, "keep a straight face" scoring, fatigue, suspense. |
| Head pose and gaze (AU51–64, GAZE_DOWN/AWAY) relative to neutral | engine | Hands-free control, "look away" detection, shame/pride/embarrassment displays. |
| 60 fps TrueDepth path on iOS, all 52 blendshapes, infrared (works in the dark) | `ios/` | Latency and brow accuracy good enough for a real-time game; the dark-room horror concept depends on it. |
| One JSON model, two engines with golden-file parity, unit + e2e tests, CI, GitHub Pages, PWA/offline | repo-wide | A lesson, a target face or a game rule defined as *data* runs identically on web and iPhone. |
| 100% on-device, nothing uploaded | both apps | The strongest privacy story possible for a camera product, and what keeps you out of the EU AI Act's worst categories. |

### Weaknesses to design around (from `docs/VALIDATION.md`)

- **Web brows are under-reported** (MediaPipe): fear, worry and "brows raised and
  drawn together" are weak on the web. Design web mechanics around mouth, cheeks,
  eyes, jaw, head and timing; keep brow-heavy mechanics for iOS or after range calibration.
- **Uncalibrated anger and disgust are weak on the web**; happiness, surprise, blinks,
  jaw and head pose are reliable everywhere. First-session mechanics should use only the
  reliable set, and calibration must be part of the *tutorial*, not a chore.
- **Single-photo accuracy is about 46%**. Irrelevant for calibrated, same-person,
  temporal use (far better), but it means the product must never present a label as a
  fact about a stranger.
- **Occlusion** (hands on the face) is not detected. Every concept needs a
  "face lost / hand on face / bad light" state that reads as feedback, not as cheating.
- **The UI is an instrument panel** (bars, percentages, AU tables). Each concept needs
  its own front end; the engine is reused as a library.
- **Expressions are not feelings** (Barrett et al. 2019, already acknowledged in
  `docs/RESEARCH.md`). Each concept below is built so that this limitation is part of
  the *design*, not a disclaimer at the bottom.

---

## 2. What the research says (the parts that change the design)

### 2.1 Face games: the viral unit is the face, and that is also why they die

- **FaceDance Challenge** (2017) is the only true breakout: mimic emojis to the beat,
  built-in recording, viral in about a week, reported >10M official downloads plus
  tens of millions on Chinese Android stores. Eight months later the studio's
  post-mortem said fame and revenue fell well short; they bolted on multiplayer to fix
  retention. The shareable *video of your face* drove growth; once shared, there was
  no reason to come back.
- **Rainbrow, Nose Zone, Face Hero** (iPhone X launch, 2017): press bump, then dead.
  One-trick input, hardware-gated audience.
- **Snapchat Snappables** (2018, eyebrow weightlifting, blink-to-shoot): the whole games
  effort was shut in 2022–23 for lack of monetisation. The face-trigger grammar lives
  on in TikTok/Instagram filter games, inside platforms.
- **Where face tracking became a durable habit**: VTubers (reported ~$3.1B market).
  Face tracking retains when it is a *performance/identity* tool or an *occasion*
  tool, not when it is a novelty controller.
- **Nobody has shipped emotion-aware scoring.** Everything above is geometry (mouth
  open, brows up, blink). Duchenne smiles, compound emotions, fear AU sets and blink
  suppression as *mechanics* are unclaimed. The nearest live competitor is **MIMIC**
  (2025–26): same 5 emoji daily, 3 s per face, on-device 0–100 score, streaks, share
  strip. Geometry only.
- **Horror that reads you** exists on PC only and binary: *Nevermind* (2015, Affectiva
  fear), *DON'T STOP SMILING* (2026, dies when your smile fades), *Our Eyes See No Evil*
  (eyes-closed detection). Mobile, AU-level, in the dark: unclaimed.
- **Comfortable inputs** (InterFACE, CHI 2025, 53 AUs tested): mouth open, squint each
  eye, cheek puff each side, mouth corners sideways are both comfortable to repeat and
  reliably recognised. Eyebrow raise is reliable but tires fast. Design 60–120 s rounds.
- **Control feel**: Schmitt-trigger hysteresis (fire 0.6, release 0.35), 2–3 frame
  debounce, dead zone around neutral, calibration at session start. Keep total
  input-to-screen latency under 100 ms (ARKit's 60 fps gives ~17 ms sensor cadence).
- **Retention benchmarks** (GameAnalytics 2026, reported): median D1 ~22%, D7 <4%,
  D30 <1%; top 25%: D1 >30%, D7 6–7%; top 1%: D1 64–68%, D30 13–15%.
- **Party games retain by occasion**, not by daily ritual: Heads Up! (reported >70M
  downloads, Apple's top paid app five years running, bought by Netflix) wins on zero
  explanation, the phone as a prop for an offline room, and *filming the group*.

### 2.2 Lie detection: the face cannot do it, but it shows effort and inconsistency

- Humans detect lies at **54%** (Bond & DePaulo 2006, 206 studies). The median cue
  effect size across 158 cues is tiny (DePaulo et al. 2003). Gaze aversion, the belief
  held in 75 countries, has an effect size near zero. Liars, if anything, move *less*.
- **Micro-expressions are rare and non-diagnostic**: ~2% of 700 expressions contained
  one (Porter & ten Brinke 2008); in televised pleas, 6 in deceivers vs 8 in genuine
  pleaders (2012). Training on micro-expressions (METT) did not improve lie detection
  (Jordan et al. 2019, slightly below chance). The "truth wizards" are explainable by chance.
- **What did separate deceptive pleaders**: failed simulation and leakage at AU level:
  full frontalis (AU1+2) where sadness should be, subtle zygomatic (AU12) leaking
  through a neutral face; a multi-cue model reached 90% in-sample (ten Brinke & Porter 2012).
- **Blink suppression is real** (Leal & Vrij 2008; Perelman 2014 replicated the
  suppression, not the rebound): blink rate *drops* during the lie, as a cognitive-load
  signal, within person, small samples.
- **Duchenne is a weak lie cue**: 83% of people can produce a fake Duchenne smile that
  others accept (Krumhuber & Manstead 2009).
- **Deployed systems failed**: EyeDetect (as low as 50% for guilty subjects), iBorderCtrl
  (flagged an honest reporter), TSA SPOT (GAO: deployed without validation). Generative
  AI is lie-biased and worse than humans (Markowitz, MSU, Nov 2025).
- **Honest ranking of your signals** for a "tell": (1) blink-rate suppression vs personal
  baseline; (2) AU-level inconsistency / failed simulation; (3) asymmetry of deliberate vs
  spontaneous expressions; (4) Duchenne vs polite (weak); (5) brief expressions (rare);
  (6) gaze aversion and face touching (myths).
- **The market is huge and the incumbents are trash**: the biggest "LIE DETECTOR" iOS app
  has reported 1M+ downloads and a 2.2-star rating from ~155K ratings (fingerprint
  prank). Deception *games* without sensors thrive: Imposter (reported 6M+, 4.8 stars),
  Jackbox Fibbage, Spyfall, Werewolf; The Traitors drew 40,000 applicants for series 2.
  #liedetectortest on TikTok has billions of views.
- **Policy**: Apple 1.1.6 bans trick/joke functionality ("for entertainment purposes" does
  not cure it); Google Play bans "misleading claims" even if labelled a joke. The EU AI
  Act bans emotion inference in workplaces and schools (Art. 5(1)(f)); elsewhere an
  "emotion recognition system" is high-risk by default, but Recital 18 excludes "mere
  detection of readily apparent expressions, gestures or movements" unless used to infer
  emotions. **Lever**: output *movements vs your own baseline* ("blink rate fell 60%",
  "AU12 leaked"), not truth or emotion labels.

### 2.3 Education: training works for recognition, nobody trains production

- Micro-expression recognition training works and holds for weeks (Hurley 2012,
  n=306; Matsumoto & Hwang 2011), best with practice + feedback. It does not transfer
  to lie detection.
- *Making* faces improves *reading* them: instructing adults to imitate expressions
  improved recognition; the UCSD "Emotion Mirror" game (mimic-it / it-mimics-you)
  improved recognition of dynamic faces, most for engaged players. It never shipped.
- Autism: meta-analysis of RCTs (n=595) finds robust recognition gains, weak
  generalisation. Superpower Glass (Stanford, JAMA Pediatrics 2019) gains faded six
  weeks after. The neurodiversity critique ("double empathy", drills teach masking) is
  serious: frame as *expression literacy and motor skill*, never mind-reading.
- **Every micro-expression product is a static photo quiz** (Ekman METT/SETT $119–299,
  Humintell MiX $29–89, App Store apps with <10 ratings). None uses the camera.
- Presentation coaches (Yoodli, Orai) score filler words and eye contact; webcam metrics
  are their least-trusted feature, and Yoodli had a data-use backlash. Face yoga apps
  (Luvly, reported ~$370–420k/month average per app) prove people pay monthly for a
  face-exercise habit, and get hammered for subscription traps.
- Closest technical analogue: a 2026 JMIR facial-palsy pilot on iPhone TrueDepth,
  on-device, real-time symmetry biofeedback, n=21, SUS 88, patients preferred it to paper.
- **Duolingo mechanics with data**: 47.7M DAU (Q2 2025), >10M users with 1-year streaks,
  a third of DAU in a Friend Streak; streak at top of app +3% DAU; leagues +17% learning
  time. Caveat: streak screens fell from 14% to 8% of apps in 2025. Streaks only hold
  when the daily loop is genuinely worth doing.
- **Regulatory**: Apple 5.1.2(vi) forbids using face data for marketing or data mining;
  COPPA (amended, in force 2025–26) now counts facial templates as personal information.
  On-device processing is the clean path; avoid the Kids category at first.

---

## 3. Concept A (education): **Expressionist**

> *"Learn faces the way Duolingo teaches Spanish. Your face is the keyboard."*

Working title. Alternatives: *Mien Lab*, *Facelit*, *Units*.

### The idea

A daily skill app with two kinds of drills, both graded by the engine:

1. **Read**: a face appears (a 3D head driven by one of your 43 prototypes, or a
   licensed clip). Name the expression, then the compound, then the *action units*.
   Reaction time and accuracy are tracked. Then the "Why" panel you already have
   becomes the lesson: slot by slot, muscle by muscle, paper by paper.
2. **Make**: now *you* produce it. A translucent "ghost face" (the target prototype
   rendered as a landmark mesh over your mirrored face) shows where your brows, lids,
   cheeks and lips must go; your region heat-map shows what you are actually moving. The
   engine scores the match (distance between your live AU vector and the prototype's slots,
   with inhibitors counting against you). "Felt smile: you have AU12 at 80% but AU6 at
   10%. Squeeze the eyes." Three attempts, best counts.

The curriculum is the model's own tier structure, which is already a skill tree:

```
Primary (7)  →  Felt vs polite smile  →  Compounds (15)  →  Social (embarrassment, pride, shame)
             →  Cognitive (confusion, concentration, skepticism…)  →  Extended  →  FACS codes
```

Each of the 37 AUs is a "muscle" with a mastery level, like Duolingo crowns. The
**Face** tab's muscle names (`aus[*].muscles`) become an **X-ray mode**: a stylised
drawing of the facial muscles over your camera image, each lighting up with its AU
intensity. You *see your own zygomaticus major fire*. That is the "super cool" moment
in the first 60 seconds, and it is unique to an AU-level engine.

### Why it is sticky

- **Face of the Day**: one shared expression for everyone, every day (Wordle-shaped).
  Compound and social faces make good puzzles: "happily disgusted", "contemptuous
  smile", "polite surprise". Three attempts, 0–100, 90 seconds total.
- **Share card = a 10-cell AU heat-map grid**, not a photo. Spoiler-free, no privacy
  friction, instantly recognisable in a group chat. (MIMIC shares a photo strip; you share
  the *muscles*.)
- **Friend streaks** and a weekly league on Face-of-the-Day score. A third of Duolingo's
  DAU are in a friend streak; it is their best retention feature.
- **Your range grows**: the personal range calibration you already have becomes a
  visible stat ("brow range 62% → 78% this month"). Progress you can feel in your face,
  like a stretching app.
- **Spaced repetition** over the 43 prototypes + 37 AUs: items you misread or
  mis-produce come back sooner.
- **Streak freeze and a weekly recap** of accuracy, speed and range (monetised, Duolingo-style).

### Audiences and what each pays for

| Audience | What they want | Tier |
|---|---|---|
| Curious people, psychology fans, "Lie to Me" viewers | Read faces better, party trick, self-knowledge | Free + Plus (~$5–8/mo): unlimited drills, leagues, recap |
| Actors, singers, streamers/VTubers, animators, UX/market researchers, FACS trainees | Expressivity range, control of single AUs, FACS coding practice | **Pro** (~$15–25/mo or one-off): AU coding drills with intensities, blendshape curve export, "expressivity report". FACS certification costs weeks plus ~$1,700 of tutoring; a practice tool that checks your own face does not exist. |
| Neurodivergent learners, speech/language therapists | Expression literacy drills | Later, with clinicians; framed as literacy, opt-in, never a diagnosis |
| Facial palsy / post-stroke home exercise | Symmetry biofeedback (your AUnU features) | Later, "exercise" framing only (Apple 1.4.1); the JMIR pilot shows demand |

### Why no one can copy it quickly

Competitors run geometry (blendshapes) or black-box emotion classifiers. The teaching
content *is* the explainability: slot evidence, inhibitors, variants, citations. That
comes free from `model/emotion-model.json` and `explainExpression`.

### Engineering deltas

- Target-face matcher: `matchPrototype(aus, expression) → { score, perSlot, inhibitors }`.
  Mostly a reuse of `explainExpression` with a distance metric.
- Ghost-face renderer: prototype → ARKit blendshape vector → landmark offsets (web) or
  a 3D head (`SceneKit`/`three.js` with a CC-licensed ARKit-rigged head). The same
  renderer produces the "Read" stimuli, so you never need a face dataset.
- X-ray muscle overlay: SVG muscle shapes anchored to landmarks.
- Drill/spaced-repetition scheduler, daily seed, share-card renderer, streaks (local
  first; accounts later, with no face data on the server).
- Content: one 60-second lesson per prototype written from the existing `cues`,
  `gloss` and `references`.

### Risks

- Consumer education is a grind; the pro tier (actors, animators, FACS) is the more
  certain money and also the best marketing (they post videos).
- Keep clear of schools and employers in the EU (Art. 5). Don't launch in the Kids category.
- Web brows: run "Make" drills for brow-heavy faces only after range calibration, or
  show a "best on iPhone" badge.

---

## 4. Concept B (lie detector): **TELL**

> *"The only lie detector honest enough to tell you it isn't one."*

Working title. A *tell* is a poker word for an unconscious giveaway. Alternatives:
*Poker Face*, *Leak*, *Straight Face*.

### The reframe

The face cannot reveal lies (54% in 206 studies). It *can* reveal **effort and
inconsistency against your own baseline**: blink suppression under cognitive load,
a smile leaking through a neutral face, surprise brows (AU1+2) in a posed sad face,
asymmetric deliberate expressions. So the app never says "LIE". It measures **tells**,
shows them beautifully, and the *room* decides. That is simultaneously the honest
position, the legally safe position, and a better game, because the sensor becomes a
suspicion engine for a group, not an oracle.

### Modes (pass-the-phone or two phones, 2–8 players)

1. **Two Truths and a Tell**. The hot-seat player reads three statements to the camera
   (a 10-second baseline comes first, disguised as "say your name and what you had for
   breakfast"). The room sees nothing live. After the third statement the phone shows
   the **Tell Meter** per statement and the room votes. Then the reveal: a 3-second
   slow-motion **leak replay** of the statement with the highest tell, with the muscle
   heat-map and a caption ("blink rate dropped 70%", "left lip corner pulled 0.4 s after
   'honestly'"). That clip is the viral unit.
2. **Interrogation**. Rapid-fire yes/no questions from the deck (or typed by the
   detectives). The suspect must answer *everything* with "yes". The Tell Meter runs
   live for the detectives, hidden from the suspect. Fifteen seconds. Detectives pick the
   question that produced the biggest tell and must guess what the truth was.
3. **Fake It**. The app asks you to *pose* sadness, disgust or fear, the three hardest
   emotions to fake (Porter & ten Brinke). It scores leakage: AU1+2 in your "sad" face,
   AU12 creeping into "disgust", asymmetry, and whether your eyes joined in. Lowest
   leakage wins. This mode is also a stealth lesson.
4. **Stare-down**. Two faces, one phone, blink events on both. First to blink loses;
   smiles (AU12) and brief expressions cost points. The engine's blink durations and the
   no-blink gate make this precise.
5. **Poker Face (solo daily)**. Sixty seconds of a provocative clip feed (memes, your
   own camera roll, friends' submissions). Keep a straight face: any AU12, AU6, brow or
   jaw movement above your baseline drains the meter. Daily score, streak, share card
   of your leakage timeline. This is the ritual that keeps the app installed between parties.

### Science mode (honesty as a feature)

Every tell has an info button with the real effect size and citation: "Blink
suppression: Leal & Vrij 2008, n=26, replicated once. Gaze aversion: no effect; we don't
score it." Users rate prank lie detectors 2.2 stars because they feel cheated. A game
whose needle *demonstrably responds to your face* and *tells you what it can't do* is
the differentiator, and it is the Apple 1.1.6 defence: nothing in the app is fake
functionality.

### Why it is sticky and viral

- **Occasion loop** (Heads Up!, Jackbox): zero rules to explain ("say three things,
  one is a lie"), the phone is a prop, laughter is the reward. Reinstalled whenever a
  group forms.
- **The replay is the share.** FaceDance's growth was the recorded face. The leak
  replay is a 3-second, heat-mapped, captioned clip, recorded only with the hot-seat
  player's tap-to-consent, saved to their camera roll, never uploaded by the app.
- **Daily solo ritual** (Poker Face) with a streak, so the app has a reason to be opened
  on a Tuesday.
- **Decks** as content and revenue (Jackbox/Heads Up! model): "Couples", "Office
  (not in the EU)", "Family dinner", "Creator packs". Netflix and streamer tie-in decks
  are the obvious expansion.
- **TikTok format is pre-validated**: #liedetectortest content has billions of views;
  the November 2023 "gauge + buzzer" meme is exactly this screen.

### Positioning and policy guard-rails

- Store name and copy: "TELL: the poker-face party game". Never "lie detector" as the
  app name or in screenshots as a claim; "lie detector" may appear in the description
  as what the app is *not* ("Science says faces don't reveal lies. This game reveals
  tells.").
- In-app, every meter is labelled as *movement vs your own baseline*. No truth labels,
  no emotion labels in the scoring (the lesson copy can name emotions; the score cannot).
- The 10-second baseline is mandatory and is the mechanic, not a setting.
- Not for hiring, teaching, employees, interviews. Say so in the terms and the UI.
- A consent tap before any replay is saved; the app never uploads.

### Engineering deltas

- Session recorder: AU timeline + blink events + brief expressions per statement, with
  a ring buffer of frames (or landmark meshes, cheaper and privacy-friendlier) for the
  replay.
- Tell score: a weighted z-score of (blink-rate change, AU12/AU6 leakage, AU1+2 in posed
  sadness, AUnU asymmetry, brief expressions) against the session baseline; a tuning
  pass with friends on video, not a dataset.
- Two-face tracking for Stare-down (MediaPipe supports `numFaces: 2`; ARKit tracks one,
  so iOS Stare-down is two phones or pass-the-phone).
- Replay renderer with heat-map and captions, exported as MP4 (web: `MediaRecorder`;
  iOS: `AVAssetWriter`).
- Decks as JSON; a seeded daily feed for Poker Face.

### Risks

- The review bar: if a reviewer reads it as a "lie detector", 1.1.6 or 1.4.1 can bite.
  The honest framing is the mitigation; have the Science-mode screenshots in the review notes.
- A bad-lighting web session makes the needle jitter; gate live scoring on a tracking
  confidence and show it ("move to the light").
- Someone will use it to accuse a partner. The copy has to make "it cannot know" impossible to miss.

---

## 5. Concept C (game): **Lights Off**

> *"Play with the lights off. It can still see you. It only moves when you blink."*

Working title. Alternatives: *Don't Blink*, *The Watcher*, *Blink*.

### The idea

A single-player horror/suspense game in which the camera is the enemy's eyes. You are
in a dark room (the phone screen is the only light; on iPhone the TrueDepth infrared
tracks your face in total darkness, which no webcam game can do). Something is in the
room with you. The rules, which the game never states but you learn in two minutes:

- **It moves only while your eyes are closed.** Every blink event (you already detect
  them with durations) advances it. Long blinks move it further. Holding your eyes
  open hurts, and the game knows your blink baseline, so it paces itself to *you*.
- **It gets bolder when you are scared.** The fear configuration (AU5 wide eyes,
  AU1+2+4 on iOS, AU20, jaw drop, a blink-rate spike, head retreat) raises the threat
  level. Calm faces (low AU5, stillness, relaxed brows) make it lose interest. Playing
  well means *controlling your own fear response*, which is a genuinely novel skill loop.
- **Genuine laughter banishes it.** A felt smile (AU6+AU12) at the right moment, not
  a polite one, resets the room. The game occasionally shows you something absurd, and
  only a *real* laugh counts. (No shipped game scores Duchenne smiles.)
- **Drowsiness is death.** PERCLOS creeping up (you are literally nodding off at
  2 a.m.) lets it win. The game is designed to be played at night.

Runs are roguelike "nights": a new room, a new entity with a different tell (one only
moves on *long* blinks, one is attracted to AU4 frowns, one mirrors your own face back
at you from the dark, using your landmarks). Thirty nights to finish. Ten minutes a night.

### Why it is unique and cool

- It reacts to **genuine emotion**, not geometry. The PC precedents (*Nevermind*,
  *DON'T STOP SMILING*) are binary; nobody has AU-level fear, blink events with
  durations, PERCLOS and Duchenne on a phone, in the dark.
- "The game that knows when you're scared" is a one-sentence pitch that journalists and
  streamers repeat without help.
- The **reaction reel**: with an opt-in tap at the start of a night, the game saves the
  2 seconds of your face around each scare (locally, your camera roll). People already
  film themselves playing horror; here the game does it for them and stamps it with the
  entity and your fear level. That is the share unit, and it is the same artefact that
  made FaceDance and Animoji karaoke spread.
- **Accessibility is free**: it is hands-free by design. Motor-impaired players get a
  full game, and that community is loyal and press-friendly.

### Why it is sticky

- Nightly ritual with a fixed, short session and a reason to return (the next entity,
  the next room, your "nerve" stat improving: fewer fear spikes per night, longer
  eyes-open holds).
- A **daily seeded night** that everyone plays, with a share card (fear timeline as a
  heartbeat line, blink count, how far it got).
- Weekly "entity" drops as content.
- Replayability from the entities' different tells, which also keeps the face work
  varied so it does not tire (InterFACE found repeated brow raises fatigue fast; fear
  and calm are *low-effort* states to hold, which is why this works where
  eyebrow-controlled games failed).

### Engineering deltas

- Game loop and renderer (2D, dark, audio-led; most of the horror is sound and your own
  face). Spatial audio sells "it is behind you".
- Threat controller fed by `events` (blink durations), `aus` (AU5, AU1, AU2, AU4, AU20,
  AU26, AU6, AU12), `blinkRate`, `perclos`, `pose` and `STILL`. Hysteresis on every trigger.
- Dark-mode tracking: iOS native (infrared) is the flagship; on the web, a mode that
  uses the screen as the light source, with the confidence gate.
- Opt-in reaction capture to the camera roll; nothing uploaded.
- Age rating 12+ (jump scares); no Kids category.

### Risks

- Narrower audience than A or B; horror is a genre, not a utility. The upside is that
  horror audiences stream and share more than anyone.
- Web version is second-class (brows, lighting). Make iPhone the headline platform.
- Blink detection must be near-perfect or the core rule feels unfair; you already have
  the no-blink gate and durations, but tune it on real faces in low light.

### Two alternates worth keeping on the shelf

- **Make Me Laugh** (co-op party): one player performs, the other's *felt* smile is the
  only point source. Polite smiles score zero. Then swap. Two phones or one phone passed.
  Simple, loud, shareable; overlaps with TELL's Stare-down and could be a TELL mode.
- **Face Charades** (async multiplayer): convey a compound emotion ("fearfully
  surprised", "happily disgusted") to a friend using only your face. The engine judges
  your production; the friend guesses. Expression as the *communication channel* is
  unclaimed and the stable 60 fps tracking is what makes it feel fair.

---

## 6. Comparison and recommendation

| Criterion | Expressionist | TELL | Lights Off |
|---|---|---|---|
| Uniqueness | High (production training w/ FACS) | High (honest sensor in a proven genre) | Very high (emotion-reactive horror, works in the dark) |
| Demand signal | Medium (micro-expression tools are tiny; face yoga and Duolingo prove the habit) | Very high (billions of views, 1M+ downloads on a 2.2-star app, Imposter 6M) | Medium (horror streams; PC precedents) |
| Stickiness mechanism | Daily ritual + streaks + range stat | Occasion + solo daily drill | Nightly roguelike + daily seed |
| Viral unit | AU heat-map card | Leak replay clip | Reaction reel |
| Engine readiness | High | High | Medium |
| Platform | Web and iOS equal | Web and iOS equal (pass-the-phone) | iOS flagship, web secondary |
| Regulatory heat | Low (individuals only) | Medium (framing is everything) | Low |
| Revenue model | Plus + Pro subscriptions | Decks + Plus | Premium + entity packs |
| Time to a playable MVP | 6–8 weeks | **4–6 weeks** | 8–12 weeks |

**Recommendation: build TELL first.** It has the largest proven demand, the worst
incumbents, the simplest rules, and a solo daily mode that keeps it installed. Its
honesty is its moat. Then layer **Expressionist** in as the "learn why you leaked"
track (the Fake It mode is already a lesson), sharing the matcher, the recorder and the
share-card renderer. **Lights Off** is the one to build when you want press and a
flagship for the iPhone's infrared camera; it can live inside the same app as a mode.

### The shared spine (build once)

1. `matchPrototype()`: live AUs vs a target prototype, per-slot feedback.
2. Session recorder: AU timelines, blink and brief-expression events, ring buffer for replays.
3. Replay and share-card renderers (heat-map over landmarks; MP4 and PNG export; local only).
4. Tracking confidence + occlusion/lighting flag surfaced as feedback.
5. Daily seed, streaks, local profile; accounts later without face data.
6. One privacy screen used everywhere: "Nothing leaves your phone", shown *before* the camera permission (contextual explanations raise opt-in from roughly 40–50% to 65–80%, reported).

### A 12-week path

| Weeks | Deliverable |
|---|---|
| 1–2 | Shared spine on the web app: matcher, recorder, confidence flag, share card |
| 3–5 | TELL: Two Truths and a Tell + Poker Face daily, web + GitHub Pages; test with friends on video |
| 6 | Science mode, decks, replay export; iOS port of the two modes (engine already there) |
| 7–8 | Interrogation, Fake It, Stare-down; TestFlight |
| 9–10 | Expressionist track: X-ray mode, Face of the Day, 20 lessons generated from the model |
| 11–12 | Lights Off prototype on iOS (blink + fear + Duchenne), one entity, one night, reaction reel |

---

## 7. Open questions for you

1. **Platform priority**: iPhone native first (best tracking, infrared, App Store
   revenue) or the web PWA first (no review, instant sharing by link, Android)? TELL
   works on both; Lights Off needs iPhone.
2. **Audience**: consumers only, or is the pro/creator tier (actors, animators, FACS
   students) interesting to you? It changes Expressionist's first 20 lessons.
3. **Money**: subscriptions, one-off decks, or none for now?
4. **Reaction clips**: comfortable shipping an opt-in local recording feature, or keep
   replays as landmark-mesh animations (no pixels) for the first version?
5. **Team**: solo? That favours TELL on the web first, with the iOS port after the rules are tuned.

---

## Sources

Science of expression and deception
- Bond & DePaulo (2006), Accuracy of deception judgments. https://pubmed.ncbi.nlm.nih.gov/16859438/
- DePaulo et al. (2003), Cues to deception. https://smg.media.mit.edu/library/DePauloEtAl.Cues%20to%20Deception.pdf
- Vrij, Hartwig & Granhag (2019), Reading lies. https://researchportal.port.ac.uk/en/publications/reading-lies-nonverbal-communication-and-deception/
- Porter & ten Brinke (2008), Reading between the lies. https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2008.02116.x/
- ten Brinke & Porter (2012), Cry me a river. https://humintell.com/wp-content/uploads/2022/04/Crymeariver20121.pdf
- Burgoon (2018), Microexpressions are not the best way to catch a liar. https://pmc.ncbi.nlm.nih.gov/articles/PMC6158306/
- Leal & Vrij (2008), Blinking during and after lying. https://researchportal.port.ac.uk/en/publications/blinking-during-and-after-lying/
- Perelman (2014), Blink suppression replication. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3932793/
- Jordan et al. (2019), METT does not improve lie detection. https://www.hud.ac.uk/news/2019/september/mett-lie-detection-tool-flaws-street-huddersfield/
- Bond & Uysal (2007), On lie detection "wizards". https://link.springer.com/article/10.1007/s10979-006-9016-1
- Krumhuber & Manstead (2009), Can Duchenne smiles be feigned? https://orca.cardiff.ac.uk/id/eprint/11589/
- Barrett et al. (2019), Emotional expressions reconsidered. https://pmc.ncbi.nlm.nih.gov/articles/PMC6640856/
- GAO-14-159 on TSA SPOT. https://www.gao.gov/products/GAO-14-159
- Markowitz (2025), generative AI and lie detection. https://msutoday.msu.edu/news/2025/11/can-ai-tell-when-someones-lying-msu-study-says-not-yet
- Hurley (2012), Matsumoto & Hwang (2011), micro-expression training. https://ifp.nyu.edu/2011/journal-article-abstracts/do-you-see-what-i-see-learning-to-detect-micro-expressions-of-emotion/ ; https://www.humintell.com/2011/05/the-efficacy-of-training-to-recognize-microexpression-of-emotion/
- Emotion Mirror (UCSD). https://www.researchgate.net/publication/262156359_Emotion_Mirror_A_Novel_Intervention_for_Autism_Based_on_Real-Time_Expression_Recognition
- Voss et al. (2019), Superpower Glass RCT; critique. https://www.hcplive.com/view/efficacy-wearable-tech-children-with-asd- ; https://thetransmitter.org/spectrum/tech-firms-superpower-glass-autism-not-super-experts-say
- Facial palsy TrueDepth pilot (JMIR Rehab 2026). https://rehab.jmir.org/2026/1/e81963
- InterFACE (CHI 2025), comfortable facial inputs. https://www.gla.ac.uk/news/headline_1169640_en.html
- Latency thresholds for games. https://webdocs.cs.ualberta.ca/~wfb/publications/C-2014-SIGCHI-Latency.pdf
- Google Project Gameface. https://blog.google/innovation-and-ai/products/google-project-gameface/

Market and products
- FaceDance Challenge case study and post-mortem. https://visagetechnologies.com/case-studies/first-game-using-front-camera-play-goes-viral/ ; https://theleader.vn/buoc-hut-cua-diffcat-cha-de-game-viet-tung-vang-danh-khap-chau-au-va-my-d31220.html
- Rainbrow / iPhone X face games. https://thenextweb.com/apps/2017/12/22/iphone-x-game-face-controller/
- Snapchat Snappables; Snap games shutdown. https://macrumors.com/2018/04/25/snapchat-snappables-ar-games ; https://www.dexerto.com/entertainment/did-snapchat-remove-games-2057934/
- Heads Up! https://techcrunch.com/2022/08/23/netflix-adds-heads-up-to-its-games-roster-with-decks-based-on-its-hit-shows-including-stranger-things
- MIMIC (daily face game). https://www.producthunt.com/p/mimic-5/mimic-7
- Nevermind (fear-adaptive horror). https://blog.affectiva.com/finding-the-essence-of-fear-in-nevermind
- DON'T STOP SMILING. https://cogconnected.com/2026/01/dont-stop-smiling-has-launched-its-steam-store-page/
- VTuber market (Mordor). https://mordorintelligence.com/industry-reports/vtuber-market
- Mobile retention benchmarks 2026 (GameAnalytics via InvestGame). https://investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf
- Prank lie-detector apps. https://mwm.ai/apps/lie-detector-free/356053562 ; https://spark.mwm.ai/en/apps/face-lie-detector/1310263913
- Imposter party game. https://spark.mwm.ai/en/apps/imposter-party-word-game/6745120053
- Lie-detector TikTok trends. https://amp.knowyourmeme.com/memes/hand-over-face-lie-detector-eyes-over-heaven-hand-trend
- Ekman METT/SETT and Humintell MiX pricing. https://www.paulekman.com/product-category/online-training-tools ; https://www.humintell.com/product/mix-enhanced/
- Yoodli reviews. https://www.aitooldiscovery.com/guides/yoodli-ai-reddit
- Luvly (Trustpilot). https://www.trustpilot.com/review/luvly.care
- Duolingo Q2 2025 and streak experiments. https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm ; https://blog.duolingo.com/improving-the-streak
- Camera permission opt-in rates (reported). https://www.dolfy.ai/blog/permission-prompt-problem-camera-location-mobile-apps

Policy
- EU AI Act Art. 5 emotion recognition (FPF). https://fpf.org/blog/red-lines-under-eu-ai-act-unpacking-the-prohibition-of-emotion-recognition-in-the-workplace-and-education-institutions/
- EU AI Act Recital 18. https://ai-act-law.eu/recital/18/
- Apple App Store Review Guidelines (1.1.6, 1.4.1, 2.5.14, 5.1.2). https://developer.apple.com/app-store/review/guidelines/
- Google Play misleading claims. https://support.google.com/googleplay/android-developer/answer/9888077
- COPPA amended rule 2025. https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule

Verification note: download, revenue and market figures above come from secondary
sources (store trackers, press, vendor blogs) and are marked "reported". Several
primary pages were unreachable from the research environment.
