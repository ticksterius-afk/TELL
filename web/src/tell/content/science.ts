/**
 * The Science screen: one card per scored component with its citation and a
 * plain sentence on the effect, what is not scored and why, and the terms.
 * This is the one place TELL may name emotions and cite the cue research;
 * the copy audit (tests/tell-copy.test.ts) allowlists these sentences.
 */
export const SCIENCE = {
  intro:
    "People spot lies at about 54% in 206 studies — a coin toss. TELL does not try to beat that. It measures how much a face moved away from its own baseline during each statement, in this session and this light, and shows the measurement. The room decides.",
  components: [
    {
      title: "Blink suppression",
      what: "The longest stretch with the eyes held open during a statement, compared with the baseline's longest stretch and typical blink interval.",
      evidence: "Blink rate drops while a person concentrates on a demanding answer and rebounds after. A within-person signal with a small sample; replicated once in part. Treated as the strongest cue here, still far from proof.",
      cite: "Leal & Vrij 2008 (n = 26); Perelman 2014.",
    },
    {
      title: "Smile leak",
      what: "Lip corners (AU12) and cheeks (AU6) rising above the baseline's 90th percentile, weighted by how long they stayed there.",
      evidence: "In public pleas by people later shown to be deceptive, a subtle smile leaked through more often than in genuine pleas. One study, one context.",
      cite: "ten Brinke & Porter 2012.",
    },
    {
      title: "Raised brows",
      what: "Inner and outer brows (AU1 + AU2) above the baseline's 90th percentile.",
      evidence: "The same study found full brow raises in deceptive pleaders who tried to look sad and failed: the forehead does not match the story. Named 'failed sadness' in the paper.",
      cite: "ten Brinke & Porter 2012.",
    },
    {
      title: "One-sided movement",
      what: "The difference between the left and right side of the mouth, cheek or brow (AU12, AU14, AU2), above the baseline.",
      evidence: "Deliberately posed expressions tend to be more asymmetric than spontaneous ones. A classic finding with modest effect sizes.",
      cite: "Ekman, Hager & Friesen 1981.",
    },
    {
      title: "Brief expressions",
      what: "Expressions that flash on and off within half a second, counted by the engine.",
      evidence: "Rare: about 2% of 700 expressions in the key study, and they appeared in genuine as well as deceptive accounts. Low weight for that reason.",
      cite: "Porter & ten Brinke 2008; ten Brinke & Porter 2012.",
    },
    {
      title: "Stillness",
      what: "How much less the head moved than in the baseline. Weight 0 by default; shown for completeness.",
      evidence: "Across 158 cues, people telling lies moved slightly less, not more. The effect is tiny (median d ≈ 0.10), so it does not count unless you turn it up in the parameters.",
      cite: "DePaulo et al. 2003 (meta-analysis of 158 cues).",
    },
  ],
  notScored: {
    title: "What we don't score, and why",
    items: [
      "Gaze aversion: no effect (d ≈ 0.03) in the 158-cue meta-analysis, although people in 75 countries believe in it.",
      "Fidgeting and face touching: no reliable effect either.",
      "'Micro-expression training': people trained to read brief expressions scored below chance at spotting lies afterwards (Jordan et al. 2019). TELL is a game, not training.",
      "Emotion labels: the same movement means different things in different people and contexts, so scores and captions name movements, never feelings.",
    ],
    cite: "Bond & DePaulo 2006 (54%, 24,483 judges); DePaulo et al. 2003; Vrij, Hartwig & Granhag 2019; Jordan et al. 2019.",
  },
  terms: {
    title: "Terms",
    items: [
      "TELL can't catch lies. Nobody can. It scores tells: movement away from your own baseline.",
      "Not for hiring, interviews, school, work, or deciding whether someone is truthful. For fun between consenting players.",
      "Everything runs on this phone. No video is uploaded, ever. Replays are drawn from face points and are not saved unless you tap Save.",
    ],
  },
};
