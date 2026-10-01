# TELL — handoff for the build session

How to run the session that builds [SPEC.md](SPEC.md): where, with which model and effort, what it reads first, the first message to send, and what the human does.


## 1. Where to run it

- Claude Code on the web (a cloud session with this repository attached) can build and
  test everything in SPEC.md: the repo's CI already runs the engine tests, build and
  Playwright with a fake camera. It cannot use a real camera, so M4 depends on fixtures
  you record.
- Hosting: this repository is private. GitHub Pages on a private repository needs a paid
  GitHub plan, so the `deploy` job in `.github/workflows/web.yml` will fail here. Options:
  (a) upgrade the plan and keep Pages; (b) deploy `web/dist` to a private preview on
  Cloudflare Pages or Netlify; (c) test from `npm run dev:https` on your LAN for now.
  Decide this before M1 is called done; the build session should make the deploy job
  skip cleanly when Pages is unavailable rather than fail CI.
- The iOS work (v2) needs Xcode; run that later as a local session on a Mac.

## 2. Model and effort

Recommendation: **one strong agent, high effort, for M0–M3; parallel agents only for
v1.1/v2.**

- M0 (engine spine, scorer design, tests): Fable 5.1 at high effort. This is the part
  where judgement matters most: a scorer that is honest, robust on short windows, and
  portable to Swift. Mistakes here propagate into every mode.
- M1–M3 (screens, flow, copy, e2e): Opus 5.5 at medium-to-high effort is a good fit;
  the spec is explicit and the work is implementation. If budget is not a concern,
  staying on Fable 5.1 for the whole thing is simplest and avoids a handover.
- M4 (tuning on your fixtures): high effort again, whichever model; it is analysis.

Opus 5.5 with Ultracode (multi-agent orchestration): **not for M0–M3.** The reasons:
- The spine is small and tightly coupled (recorder → scorer → meter → replay share one
  data shape). Fan-out creates merge conflicts in `main.ts`, `styles.css` and the Vite
  config and makes the data shape drift between agents.
- The hard decisions are design decisions (what the score means, what the copy says)
  and need one head, not ten.
- The main risk, "does it feel right on a real face", cannot be parallelised by agents
  at all; it is your camera time.
- Cost: Ultracode can burn an order of magnitude more tokens for work that a single
  agent finishes in a few hours.

Where Ultracode does make sense:
- v1.1: Interrogation, Fake It and Stare-down are independent screens on a stable
  spine; three agents, one each, plus a reviewer.
- v2: the Swift port of `recorder.ts` and `tell.ts` with golden-parity tests is
  mechanical and well-specified; a porting agent plus a test agent.
- Before release: a review fan-out (security/privacy, copy audit against the forbidden
  words and policy rules, accessibility, performance on low-end Android).

Suggested session settings: repository `ticksterius-afk/tell`, a branch off `main`;
permission mode `acceptEdits`; ask it to commit per milestone with descriptive
messages and to push only after `npm run check` and `npm run e2e` pass locally.

## 3. What the session should read first

In this order: `README.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md` (§1 and §6),
`web/src/engine/engine.ts`, `web/src/engine/temporal.ts`, `web/src/main.ts`,
`web/scripts/make-golden.ts`, `web/tests/e2e/app.spec.ts`, `web/vite.config.ts`,
`web/public/sw.js`, then `docs/tell/SPEC.md` (and `docs/CONCEPTS.md` §4 for the product
reasoning). The agent may not be able to fetch external sites from its sandbox; everything
it needs is in this repository.

## 4. The first message to send the build session

Start the session on this repository and send:

```
You are building TELL, a party game on top of the Mien expression engine in this
repository. Read CLAUDE.md, then docs/tell/SPEC.md completely, then the files listed in
docs/tell/HANDOFF.md §3, before writing code.

Scope for this session: milestones M0, M1, M2 and M3 from SPEC.md §9, in that order.
Do not start v1.1 or iOS work. Decisions listed under "Decisions already made" are
final; for anything else the spec leaves open, use its defaults and note the choice
in a short docs/tell/DECISIONS.md.

Rules:
- Keep the existing engine outputs unchanged: npm run check and the golden tests must
  stay green at every commit. New engine code (recorder, scorer) is platform-independent
  TypeScript under web/src/engine with unit tests.
- Everything on-device; no network calls, no analytics, no third-party scripts.
- The copy rules in SPEC.md §7 are hard requirements; add the forbidden-word test early
  and keep it green.
- Validate before each push: npm run check, npm run build, npm run e2e.
- Commit per milestone. Push to the designated branch. Do not open a pull request.

When you finish M3, write docs/tell/STATUS.md with: what is done, how to test it on a
phone, which scorer parameters are placeholders pending real fixtures (M4), and the
exact steps for me to record fixtures with the developer recorder.
```

## 5. What you (the human) have to do

- Before the session: decide the hosting question in §1.
- After M0 ships the developer recorder: record at least 10 sessions of yourself and
  2–3 friends playing real rounds, marking "baseline", each statement, and which was
  false. Numbers only are saved. Hand the files to the session for M4.
- After M1: play a round on an iPhone in Safari and an Android phone in Chrome in a
  normal living room; note where the quality badge complains and whether the meter
  feels responsive. Report that verbatim to the session.
- Review every line of user-facing copy before M3 is called done.
