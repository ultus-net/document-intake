export const THRESHOLDS = { accept: 0.82, hold: 0.55 } as const;

export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 3 <= text.length; i += 1) set.add(text.slice(i, i + 3));
  return set;
}

export function trigramScore(a: string, b: string): number {
  const left = trigrams(normalise(a));
  const right = trigrams(normalise(b));
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function classify(score: number, exactReference: boolean): "accept" | "hold" | "reject" {
  if (exactReference) return "accept";
  if (score >= THRESHOLDS.accept) return "accept";
  if (score >= THRESHOLDS.hold) return "hold";
  return "reject";
}
