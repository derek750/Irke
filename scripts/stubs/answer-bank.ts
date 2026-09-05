/** Throwaway stub for `@/lib/answer-bank`: no persistence, stable pure helpers. */

export function fingerprintQuestion(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function generatedDocId(entryId: string): string {
  return `generated:${entryId}`
}

export async function rememberAnswer(): Promise<void> {}
