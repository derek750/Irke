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

export function termFrequencies(text: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const token of tokenize(text)) counts[token] = (counts[token] ?? 0) + 1
  return counts
}
