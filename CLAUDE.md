# TELL (private)

This repository is the private home of **TELL**, a pass-the-phone party game built on
the Mien facial-expression engine. It started as a full copy of the public
`ticksterius-afk/facial-expression` repository (engine, web PWA, iOS app, tests, CI);
TELL is added here as a second entry point of the web app.

## Read in this order before building
1. `docs/tell/SPEC.md` — the specification (scope, architecture, scoring, screens, tests, milestones)
2. `docs/tell/HANDOFF.md` — how the build session runs and what the human does
3. `README.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md` (§1, §6)
4. `web/src/engine/engine.ts`, `web/src/engine/temporal.ts`, `web/src/main.ts`,
   `web/scripts/make-golden.ts`, `web/tests/e2e/app.spec.ts`, `web/vite.config.ts`, `web/public/sw.js`
5. `docs/CONCEPTS.md` §2 and §4 for the research and product reasoning (optional)

## Hard rules
- The existing engine outputs stay unchanged: `npm run check` (model format, iOS model copy,
  typecheck, unit + golden tests) must be green at every commit.
- New engine code (`recorder.ts`, `tell.ts`) is platform-independent TypeScript under
  `web/src/engine` with unit tests, so it can be ported to Swift later.
- Everything runs on-device: no network calls, no analytics, no third-party scripts.
- Copy rules in `docs/tell/SPEC.md` §7 are requirements: no "lie"/"truth" claims, no
  emotion labels in scores or captions; keep the forbidden-word test green.
- Validate before every push: `cd web && npm run check && npm run build && npm run e2e`.
- Commit per milestone with descriptive messages. Do not open pull requests unless asked.
- Never commit camera pixels. Recorded fixtures (`model/fixtures/tell/`) hold numbers only.

## Commands
```sh
cd web && npm install
npm run dev            # http://localhost:5173 (camera works on localhost)
npm run dev:https      # LAN testing from a phone
npm run check          # format, iOS sync, typecheck, unit + golden tests
npm run build          # production build in web/dist
npm run e2e            # Playwright with a fake camera (see web/tests/e2e/README.md)
```
