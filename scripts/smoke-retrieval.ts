import { chunkDoc } from '../src/lib/brain/chunk.ts'
import { retrieve } from '../src/lib/brain/retrieve.ts'
import type { BrainDoc } from '../src/lib/types.ts'

const docs: BrainDoc[] = [
  {
    id: 'resume',
    kind: 'resume',
    title: 'Resume',
    createdAt: 1,
    text: [
      'Software Engineer at Northwind, 2023 to present. Built a payments reconciliation service in Go and Postgres that cut manual review time by 40 percent.',
      'Software Engineer at Acme, 2021 to 2023. Led the migration of a React dashboard to TypeScript and set up the CI pipeline on GitHub Actions.',
      'Education: BS Computer Science, State University, 2021. Coursework in distributed systems and databases.',
    ].join('\n\n'),
  },
  {
    id: 'answer-why',
    kind: 'app_answer',
    title: 'Why this role',
    createdAt: 2,
    text: 'Why do you want to work here? I care about payments infrastructure because the failure modes are unforgiving and the feedback loop is concrete. I want to work on systems where correctness is the product.',
  },
  {
    id: 'about',
    kind: 'about_me',
    title: 'About me',
    createdAt: 3,
    text: 'I am a backend-leaning full stack engineer based in Boston. I want a mid-size team where I own a service end to end. I prefer plain, direct writing over corporate language.',
  },
]

const chunks = docs.flatMap(chunkDoc)
console.log(`indexed ${chunks.length} chunks from ${docs.length} docs`)

const queries = [
  'Why do you want to work at this company on payments?',
  'Tell us about your experience with TypeScript and React.',
  'Where are you located?',
  'What is your favorite pizza topping?',
]

for (const query of queries) {
  const results = retrieve(query, chunks, { limit: 3 })
  console.log(`\nQ: ${query}`)
  if (!results.length) {
    console.log('  (no match — model would be told to rely on profile only)')
    continue
  }
  for (const { chunk, score } of results) {
    console.log(`  ${score.toFixed(2)}  ${chunk.docTitle}: ${chunk.text.slice(0, 70).replace(/\n/g, ' ')}…`)
  }
}
