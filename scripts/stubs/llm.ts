/** Throwaway stub for `@/lib/llm`: records every call and answers canned text. */
import type { Settings } from '../../src/lib/types.ts'

export interface RecordedCall {
  system: string
  user: string
  temperature: number
}

export const calls: RecordedCall[] = []

export async function complete(input: {
  settings: Settings
  system: string
  user: string
}): Promise<string> {
  calls.push({ system: input.system, user: input.user, temperature: input.settings.temperature })
  return `Answer ${calls.length}: grounded text.`
}
