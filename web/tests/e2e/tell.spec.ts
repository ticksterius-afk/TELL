import { expect, test, type Page } from "@playwright/test";

/**
 * TELL end-to-end: a full round and a Poker Face daily with the fake camera.
 * The round needs a face in front of the camera (FAKE_VIDEO, same clip as
 * app.spec.ts); without it only the camera-free screens are checked.
 */
type Hook = {
  screen: string;
  fast: boolean;
  last: { face: boolean; t: number } | null;
  quality: { value: number; hint: string } | null;
  results: { status: string; score: number; captions: string[]; peak: { t0: number; t1: number } }[] | null;
};
const hook = <T>(page: Page, fn: (h: Hook) => T) => page.evaluate(fn, undefined as never) as Promise<T>;
const screen = (page: Page) => page.evaluate(() => (window as unknown as { __tell: Hook }).__tell.screen);

const FORBIDDEN = /\b(lying|liar|truthful|dishonest|deception|deceptive|afraid|angry|disgusted|happy|sad)\b/i;

async function openTell(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/tell.html${query}`);
  await expect(page.getByRole("heading", { name: "TELL" })).toBeVisible();
  return errors;
}

/** Waits for the camera button to become enabled (a face with enough quality) and taps it. */
async function tapCam(page: Page, label: RegExp | string) {
  const btn = page.getByTestId("cam-btn");
  await expect(btn).toHaveText(label, { timeout: 60_000 });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
}

test("home, privacy, players, science and settings render without a camera", async ({ page }) => {
  const errors = await openTell(page);
  await expect(page.getByText("It can't catch lies. Nobody can. It catches tells.")).toBeVisible();
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("Blink suppression")).toBeVisible();
  await expect(page.getByText(/54%/).first()).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play with friends" }).click();
  await expect(page.getByRole("heading", { name: "Before the camera" })).toBeVisible();
  await page.getByRole("button", { name: /Got it/ }).click();
  await expect(page.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await page.getByLabel("Player 1 name").fill("Maya");
  await page.getByLabel("Player 2 name").fill("Tom");
  await page.getByRole("button", { name: "+ Add player" }).click();
  await expect(page.getByLabel("Player 3 name")).toBeVisible();
  await page.getByRole("button", { name: "Remove player 3" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Pass the phone to Maya" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("plays a full round: calibrate, baseline, three statements, vote, reveal with meters and a replay", async ({ page }, info) => {
  test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m face clip");
  test.setTimeout(240_000);
  const errors = await openTell(page, "?fast=1");
  await page.getByRole("button", { name: "Play with friends" }).click();
  await page.getByRole("button", { name: /Got it/ }).click();
  await page.getByLabel("Player 1 name").fill("Maya");
  await page.getByLabel("Player 2 name").fill("Tom");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: /ready/ }).click();

  // Calibrate (fresh storage: no saved calibration).
  await expect(page.locator("#stage")).toBeVisible();
  await expect(page.locator("#rec")).toBeVisible();
  await tapCam(page, "Calibrate");
  // A slow software renderer can starve the 3 s calibration of frames; one retry is allowed.
  await expect(page.getByTestId("cam-btn")).toHaveText(/Tap, then talk|Calibrate/, { timeout: 30_000 });
  if ((await page.getByTestId("cam-btn").textContent()) === "Calibrate") await tapCam(page, "Calibrate");
  await expect(page.getByTestId("cam-btn")).toHaveText("Tap, then talk", { timeout: 30_000 });
  await page.screenshot({ path: info.outputPath("tell-calibrated.png") });
  // Baseline (4 s in fast mode, auto-stops).
  await tapCam(page, "Tap, then talk");
  await expect(page.getByTestId("cam-btn")).toHaveText("Tap to start", { timeout: 30_000 });
  // Three statements of ~3 s each.
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByText(`Statement ${n} of 3`)).toBeVisible();
    await tapCam(page, "Tap to start");
    await expect(page.getByTestId("cam-btn")).toHaveText("Tap when done");
    await page.waitForTimeout(4000);
    await page.getByTestId("cam-btn").click();
  }
  await expect(page.getByRole("heading", { name: "Hand the phone to the detectives" })).toBeVisible({ timeout: 20_000 });
  const results = await hook(page, (h) => (window as unknown as { __tell: Hook }).__tell.results);
  expect(results).toHaveLength(3);
  for (const r of results!) {
    expect(r.status).toBe("scored");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.peak.t1 - r.peak.t0).toBeLessThanOrEqual(3000);
    for (const c of r.captions) expect(c).not.toMatch(FORBIDDEN);
  }
  await page.getByRole("button", { name: "We're the detectives" }).click();

  // Vote: three meters animate to numbers.
  for (const n of [1, 2, 3]) await expect(page.getByTestId(`meter-${n}`)).toHaveText(/^\d+$/, { timeout: 15_000 });
  await expect(page.getByText("Tom, which one is false?")).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("tell-vote.png") });
  await page.getByTestId("vote-2").click();
  await page.getByRole("button", { name: "Reveal" }).click();

  // Reveal: the hot seat picks, scores update, the replay canvas draws frames.
  await page.getByTestId("false-3").click();
  await expect(page.getByRole("heading", { name: "The false one was #3" })).toBeVisible();
  await expect(page.getByTestId("verdict")).toContainText(/#3/);
  await expect(page.getByText("Maya +1")).toBeVisible();
  const replay = page.getByTestId("replay");
  await expect(replay).toBeVisible();
  const drawn = async () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="replay"]') as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  await expect.poll(drawn, { timeout: 20_000 }).toBeGreaterThan(200);
  await page.screenshot({ path: info.outputPath("tell-reveal.png") });
  await expect(page.getByTestId("save-replay")).toBeEnabled();

  // Second player, then the scoreboard.
  await page.getByRole("button", { name: "Next player" }).click();
  await expect(page.getByRole("heading", { name: "Pass the phone to Tom" })).toBeVisible();
  await page.getByRole("button", { name: /ready/ }).click();
  await tapCam(page, "That's me");
  await tapCam(page, "Tap, then talk");
  for (let n = 1; n <= 3; n++) {
    await tapCam(page, "Tap to start");
    await page.waitForTimeout(3500);
    await page.getByTestId("cam-btn").click();
  }
  await page.getByRole("button", { name: "We're the detectives" }).click();
  await expect(page.getByText("Maya, which one is false?")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("vote-1").click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByTestId("false-1").click();
  await page.getByRole("button", { name: "Scoreboard" }).click();
  await expect(page.getByTestId("scoreboard")).toContainText("Maya");
  await expect(page.getByTestId("scoreboard")).toContainText("Tom");
  expect(errors).toEqual([]);
});

test("Poker Face runs in fast mode and produces a share string with ten cells", async ({ page }, info) => {
  test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m face clip");
  const errors = await openTell(page, "?fast=1");
  await page.getByRole("button", { name: "Poker Face (daily)" }).click();
  await page.getByRole("button", { name: /Got it/ }).click();
  await tapCam(page, "Tap to start");
  await expect(page.getByTestId("pf-score")).toContainText(/Straight-face \d+/, { timeout: 30_000 });
  const share = await page.getByTestId("pf-share").textContent();
  expect(share).toMatch(/^TELL Poker Face #\d+ {2}\d+\/100 🔥 \d+\n[⬛🟨🟧🟥]{10}$/u);
  await expect(page.getByTestId("pf-grid").locator(".cell")).toHaveCount(10);
  await expect(page.getByText(/1-day streak/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("tell-pokerface.png") });
  expect(await screen(page)).toBe("pokerface");
  expect(errors).toEqual([]);
});
