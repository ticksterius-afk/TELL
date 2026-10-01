import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPONENT_NAMES } from "../src/engine/tell.ts";
import decks from "../src/tell/content/decks.json";
import { findForbidden } from "./tell-words.ts";

/**
 * Copy audit (SPEC §7). Every user-facing TELL source is scanned for verdict
 * words and emotion labels. The only places they may appear are the sentences
 * listed below, which is the whole point: the allowed uses are reviewed in one
 * place. Add a sentence here deliberately, never a word.
 */
const ALLOWED: string[] = [
  "It can't catch lies. Nobody can. It catches tells.",
  "It scores tells, never truth. For fun between consenting players; not for hiring, interviews, school, work or deciding whether someone is truthful.",
  "Not for hiring, interviews, school, work, or deciding whether someone is truthful. For fun between consenting players.",
  "TELL can't catch lies. Nobody can. It scores tells: movement away from your own baseline.",
  // Science screen: citing the research it rests on.
  "People spot lies at about 54% in 206 studies — a coin toss.",
  "In public pleas by people later shown to be deceptive, a subtle smile leaked through more often than in genuine pleas.",
  "The same study found full brow raises in deceptive pleaders who tried to look sad and failed: the forehead does not match the story. Named 'failed sadness' in the paper.",
  "and they appeared in genuine as well as deceptive accounts.",
  "Across 158 cues, people telling lies moved slightly less, not more.",
  "people trained to read brief expressions scored below chance at spotting lies afterwards",
  // Science screen: what is not scored.
  "Emotion labels: the same movement means different things in different people and contexts, so scores and captions name movements, never feelings.",
  // Share strip footer.
  "movement vs their own baseline, not a verdict",
];

const root = new URL("../", import.meta.url);
function walk(dir: URL, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = new URL(name, dir);
    if (statSync(p).isDirectory()) walk(new URL(name + "/", dir), out);
    else if (/\.(ts|json|html)$/.test(name)) out.push(p.pathname);
  }
  return out;
}

const FILES = [new URL("tell.html", root).pathname, new URL("public/tell.webmanifest", root).pathname, ...walk(new URL("src/tell/", root))];

describe("TELL copy audit", () => {
  it("scans the user-facing sources", () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it.each(FILES.map((f) => [f.replace(root.pathname, "")]))("%s uses no verdict or emotion words outside the allowed sentences", (rel) => {
    let text = readFileSync(new URL(rel, root), "utf8");
    // The deck's "faces" are expression ids for the mesh face (data, never shown); the words people see are the other lists.
    if (rel.endsWith("decks.json")) text = [...decks.ideas, ...decks.pokerface.lines, ...decks.pokerface.emoji, decks.about].join("\n");
    for (const a of ALLOWED) text = text.split(a).join(" ");
    const found = findForbidden(text);
    expect(found, `in ${rel}: ${[...new Set(found)].join(", ")}`).toEqual([]);
  });

  it("every allowed sentence is still in use (remove stale entries)", () => {
    const all = FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const a of ALLOWED) expect(all.includes(a), a).toBe(true);
  });

  it("component names, prompt cards and provocations are clean", () => {
    for (const n of Object.values(COMPONENT_NAMES)) expect(findForbidden(n), n).toEqual([]);
    for (const s of [...decks.ideas, ...decks.pokerface.lines]) expect(findForbidden(s), s).toEqual([]);
    expect(decks.ideas.length).toBeGreaterThanOrEqual(20);
    expect(decks.pokerface.lines.length).toBeGreaterThanOrEqual(15);
  });

  it("the home line and the terms are present verbatim", () => {
    const html = readFileSync(new URL("src/tell/screens/home.ts", root), "utf8");
    expect(html).toContain("It can't catch lies. Nobody can. It catches tells.");
    const science = readFileSync(new URL("src/tell/content/science.ts", root), "utf8");
    expect(science).toContain("Not for hiring, interviews, school, work, or deciding whether someone is truthful.");
    expect(science).toContain("Bond & DePaulo 2006");
    expect(science).toContain("Gaze aversion");
  });
});
