import { classifyLabel } from '../src/content/detect.ts'
import type { StoryTopic } from '../src/lib/types.ts'

/** Labels lifted from real Greenhouse / Lever / Workday / Ashby forms. */
const cases: [label: string, expected: StoryTopic | null][] = [
  ['Cover letter', 'cover_letter'],
  // Upload widgets label themselves like this. Only the cover letter is Irke's to produce;
  // the control type is checked separately in `classify`, which needs a DOM.
  ['Cover Letter (optional)', 'cover_letter'],
  ['Attach a cover letter', 'cover_letter'],
  ['Resume/CV', null],
  ['Upload your resume', null],
  ['Unofficial transcript', null],
  ['Why do you want to work at Acme?', 'why_company'],
  ['What excites you about our mission?', 'why_company'],
  ['Why are you interested in this role?', 'why_role'],
  ['Why do you want to work in this position?', 'why_role'],
  ['Why do you want to work at this company?', 'why_company'],
  ['Tell us about a time you disagreed with a teammate.', 'behavioral'],
  ['Describe a challenge you faced and how you overcame it', 'behavioral'],
  ['Walk us through a decision you regret', 'behavioral'],
  ['What are you most proud of?', 'strengths'],
  ['What makes you a great fit for this team?', 'strengths'],
  ['Tell us about a project you shipped recently', 'project'],
  ['Tell us about yourself', 'open_ended'],
  ['Anything else you would like us to know?', 'open_ended'],

  ['First name', null],
  ['Email', null],
  ['Phone number', null],
  ['LinkedIn URL', null],
  ['GitHub profile', null],
  ['Current location', null],
  ['Desired salary', null],
  ['Are you legally authorized to work in the United States?', null],
  ['Will you now or in the future require sponsorship?', null],
  ['Earliest start date', null],
  ['What are your pronouns?', null],
  ['Gender', null],
  ['Veteran status', null],
  ['How did you hear about us?', null],
  ['Highest degree earned', null],
  ['Years of experience with Python', null],
]

let failures = 0

for (const [label, expected] of cases) {
  const actual = classifyLabel(label)
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${String(actual).padEnd(12)} ${label}`)
}

console.log(`\n${cases.length - failures}/${cases.length} labels classified as expected`)
if (failures) process.exitCode = 1
