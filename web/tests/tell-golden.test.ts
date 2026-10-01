import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOLDEN_FILE, listFixtures, makeGoldenTell } from "../scripts/make-golden-tell.ts";

type Json = Record<string, unknown>;

/** Deep comparison with a 1e-5 tolerance on numbers, exact on everything else. */
function expectClose(a: unknown, b: unknown, path: string): void {
  if (typeof a === "number" && typeof b === "number") {
    expect(Math.abs(a - b), path).toBeLessThan(1e-5);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    expect(a.length, path).toBe(b.length);
    a.forEach((v, i) => expectClose(v, b[i], `${path}[${i}]`));
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    expect(Object.keys(a as Json).sort(), path).toEqual(Object.keys(b as Json).sort());
    for (const k of Object.keys(a as Json)) expectClose((a as Json)[k], (b as Json)[k], `${path}.${k}`);
  } else {
    expect(a, path).toEqual(b);
  }
}

describe("TELL golden fixtures", () => {
  it("model/fixtures/tell/golden-tell.json matches the current scorer (run `npm run golden:tell` after changing tell.json or tell.ts)", () => {
    expect(existsSync(GOLDEN_FILE)).toBe(true);
    const committed = JSON.parse(readFileSync(GOLDEN_FILE, "utf8"));
    const fresh = JSON.parse(JSON.stringify(makeGoldenTell()));
    expect(fresh.modelVersion).toBe(committed.modelVersion);
    expect(fresh.tellVersion).toBe(committed.tellVersion);
    expect(fresh.fixtures.map((f: Json) => f.file)).toEqual(committed.fixtures.map((f: Json) => f.file));
    for (let i = 0; i < fresh.fixtures.length; i++) expectClose(fresh.fixtures[i], committed.fixtures[i], fresh.fixtures[i].name);
  });

  it("the synthetic session scores sensibly: the meter points at the false statement", () => {
    expect(listFixtures()).toContain("synthetic-arkit.json");
    const g = makeGoldenTell();
    const fx = g.fixtures.find((f) => f.name === "synthetic-arkit")!;
    expect(fx.label).toBe("statement:2");
    expect(fx.meterPick).toBe("statement:2");
    const by = Object.fromEntries(fx.statements.map((s) => [s.id, s]));
    for (const s of fx.statements) expect(s.status, s.id).toBe("scored");
    expect(by["statement:2"].score).toBeGreaterThan(by["statement:1"].score + 15);
    expect(by["statement:2"].components.blink).toBeGreaterThan(0.5);
    expect(by["statement:2"].components.leak12).toBeGreaterThan(0.1);
    expect(by["statement:3"].components.brows).toBeGreaterThan(0.1);
    expect(by["statement:1"].score).toBeLessThan(15);
    expect(fx.baseline.blinks).toBeGreaterThanOrEqual(3);
    expect(fx.pokerface).toHaveLength(1);
    expect(fx.pokerface[0].straightFace).toBeLessThan(100);
    expect(fx.pokerface[0].levels[0]).toBe(0);
    expect(Math.max(...fx.pokerface[0].levels.slice(1, 3))).toBeGreaterThanOrEqual(1);
  });
});
