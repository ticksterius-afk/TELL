/**
 * Copy guard-rails (docs/tell/SPEC.md §7). Scores, captions, chips and
 * component names must not claim to detect lies and must not label emotions.
 * Science-screen text may cite emotions and lie-detection research; the copy
 * audit test keeps an explicit allowlist of those sentences.
 */
export const FORBIDDEN_WORDS: readonly string[] = [
  // verdict words
  "lie", "lies", "lied", "lying", "liar", "liars", "truth", "truthful", "untruthful", "honest", "dishonest", "honesty",
  "deception", "deceptive", "deceive", "deceiving", "deceit", "fib", "fibbing", "bluff", "bluffing", "guilty", "innocent",
  // emotion labels
  "happy", "happiness", "sad", "sadness", "afraid", "fear", "fearful", "scared", "angry", "anger", "disgust", "disgusted",
  "contempt", "surprise", "surprised", "nervous", "anxious", "anxiety", "stressed", "stress", "ashamed", "shame", "embarrassed",
];

const PATTERN = new RegExp(`\\b(${FORBIDDEN_WORDS.join("|")})\\b`, "gi");

/** Forbidden words found in a text (lower-cased), in order. */
export function findForbidden(text: string): string[] {
  return [...text.matchAll(PATTERN)].map((m) => m[1].toLowerCase());
}
