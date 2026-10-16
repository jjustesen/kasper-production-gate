// Deterministic copy checks: banned phrases and discount caps.

const DISCOUNT =
  /(\d{1,3}(?:[.,]\d+)?)\s?%\s*(?:off|discount|desconto)|(?:save|discount of|desconto de)\s*(\d{1,3}(?:[.,]\d+)?)\s?%/giu;

// A "word character" in any language, so "cura" and "é" count as letters.
const WORD = String.raw`[\p{L}\p{N}_]`;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function phrasePattern(phrase: string): RegExp {
  // Whole words only ("cure" must not match "secure"), and the words of a
  // phrase may be separated by spaces or hyphens ("before-and-after").
  const words = phrase.split(/\s+/).filter(Boolean).map(escapeRegExp);
  return new RegExp(`(?<!${WORD})${words.join(String.raw`[\s\-]+`)}(?!${WORD})`, "iu");
}

/** Banned phrases that appear in text, in list order. */
export function findBanned(text: string, banned: string[]): string[] {
  return banned.filter((phrase) => phrasePattern(phrase).test(text));
}

/** The largest discount percentage mentioned in text, or null. */
export function maxDiscount(text: string): number | null {
  const values = [...text.matchAll(DISCOUNT)].map((m) => Number((m[1] ?? m[2]).replace(",", ".")));
  return values.length ? Math.max(...values) : null;
}
