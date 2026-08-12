const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'did', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me',
  'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'to', 'was', 'we', 'were', 'what', 'when', 'which', 'who', 'why', 'will', 'with', 'you',
  'your',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/[\s./-]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

/** Shortest stem worth reasoning about; below this, strips produce noise ("me", "us"). */
const MIN_ROOT = 3
const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'ings', 'ment', 'ments', 'er', 'ers', 'ion', 'ions'] as const

/**
 * The morphological family of a query term: "disagreed" → disagree, disagreement, disagrees…
 * Stored chunk tokens are exact words (re-tokenizing them means a data migration), so matching
 * "disagreed" against a chunk that says "disagreement" has to happen on the query side: strip
 * plausible suffixes to candidate roots, then re-suffix every common way. Variants that exist in
 * no chunk cost a document-frequency lookup and nothing else. Irregular forms (won/win) are out
 * of reach by design — that is what embeddings are for.
 */
export function termVariants(term: string): Set<string> {
  const family = new Set<string>()
  if (!/^[a-z]+$/.test(term)) return family

  const roots = new Set<string>([term])
  const strip = (suffix: string, restore = ''): void => {
    if (!term.endsWith(suffix)) return
    const root = term.slice(0, term.length - suffix.length) + restore
    if (root.length >= MIN_ROOT) roots.add(root)
  }
  strip('ies', 'y')
  strip('ied', 'y')
  for (const suffix of SUFFIXES) strip(suffix)

  // Undouble a final consonant (shipp → ship) and toggle a trailing e (agre ↔ agree), so the
  // roots cover the usual spelling changes that suffixing introduces.
  for (const root of [...roots]) {
    if (root.length > MIN_ROOT && root[root.length - 1] === root[root.length - 2]) {
      roots.add(root.slice(0, -1))
    }
  }
  for (const root of [...roots]) {
    if (root.endsWith('e') && root.length - 1 >= MIN_ROOT) roots.add(root.slice(0, -1))
    else roots.add(`${root}e`)
  }

  for (const root of roots) {
    family.add(root)
    for (const suffix of SUFFIXES) family.add(root + suffix)
    if (root.endsWith('y')) {
      family.add(`${root.slice(0, -1)}ies`)
      family.add(`${root.slice(0, -1)}ied`)
    }
  }

  family.delete(term)
  for (const stop of STOP_WORDS) family.delete(stop)
  return family
}

export function termFrequencies(text: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const token of tokenize(text)) counts[token] = (counts[token] ?? 0) + 1
  return counts
}
