import { chunkDoc } from '../src/lib/context/chunk.ts'
import { retrieve } from '../src/lib/context/retrieve.ts'
import type { ContextDoc } from '../src/lib/types.ts'

const docs: ContextDoc[] = [
  {
    id: 'story-migration',
    source: 'story',
    title: 'The migration that slipped a quarter',
    createdAt: 1,
    text: 'We planned two months to move the payments reconciliation service off the legacy job runner. It took five. I had underestimated how much undocumented behavior lived in the old cron scripts, so I stopped and spent three weeks writing characterization tests before touching anything else. The migration landed with no incidents, but I would front-load that discovery work next time instead of promising a date first.',
  },
  {
    id: 'story-why-payments',
    source: 'story',
    title: 'Why payments',
    createdAt: 2,
    text: 'I care about payments infrastructure because the failure modes are unforgiving and the feedback loop is concrete. A bug is money in the wrong place, which means you find out fast and you cannot argue with the definition of correct. I want to work on systems where correctness is the product.',
  },
  {
    id: 'drive-resume',
    source: 'drive',
    title: 'Resume.pdf',
    createdAt: 3,
    text: [
      'Software Engineer at Northwind, 2023 to present. Built a payments reconciliation service in Go and Postgres that cut manual review time by 40 percent.',
      'Software Engineer at Acme, 2021 to 2023. Led the migration of a React dashboard to TypeScript and set up the CI pipeline on GitHub Actions.',
    ].join('\n\n'),
  },
  {
    id: 'github-ledger',
    source: 'github',
    title: 'derek/ledger-tools',
    createdAt: 4,
    text: 'Command line tools for reconciling double-entry ledgers against bank exports. Primary language: Go. Topics: fintech, cli, accounting. Built this after doing the same reconciliation by hand one too many times.',
  },
]

const chunks = docs.flatMap(chunkDoc)
console.log(`indexed ${chunks.length} chunks from ${docs.length} docs`)

const queries = [
  'Why do you want to work at this company on payments?',
  'Tell us about a time a project did not go as planned.',
  'Tell us about something you built outside of work.',
  'What is your favorite pizza topping?',
]

for (const query of queries) {
  const results = retrieve(query, chunks, { limit: 3 })
  console.log(`\nQ: ${query}`)
  if (!results.length) {
    console.log('  (no match — model would be told to mark every fact as needing input)')
    continue
  }
  for (const { chunk, score } of results) {
    console.log(`  ${score.toFixed(2)}  ${chunk.docTitle}: ${chunk.text.slice(0, 70).replace(/\n/g, ' ')}…`)
  }
}
