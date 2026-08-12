import { chunkDoc } from '../src/lib/context/chunk.ts'
import { cosineSimilarity, retrieve } from '../src/lib/context/retrieve.ts'
import type { ContextChunk, ContextDoc } from '../src/lib/types.ts'

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

// Fake unit vectors: "leadership" aligns with migration story; "pizza" aligns with nothing useful.
function unit(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
  return values.map((value) => value / norm)
}

const axes = {
  leadership: unit([1, 0.1, 0]),
  payments: unit([0.2, 1, 0]),
  pizza: unit([0, 0, 1]),
}

const embedded: ContextChunk[] = chunks.map((chunk) => {
  if (chunk.docId === 'story-migration') {
    return { ...chunk, embedding: axes.leadership, embeddedAt: 1 }
  }
  if (chunk.docId === 'story-why-payments' || chunk.docId === 'drive-resume') {
    return { ...chunk, embedding: axes.payments, embeddedAt: 1 }
  }
  return { ...chunk, embedding: unit([0.1, 0.1, 0.1]), embeddedAt: 1 }
})

const hybridQuery = 'Describe a time you showed ownership when a project slipped.'
const hybrid = retrieve(hybridQuery, embedded, {
  limit: 2,
  queryEmbedding: axes.leadership,
})

console.log(`\nHybrid Q: ${hybridQuery}`)
if (!hybrid.length) {
  console.error('FAIL: hybrid retrieve returned no hits')
  process.exit(1)
}
if (hybrid[0].chunk.docId !== 'story-migration') {
  console.error(`FAIL: expected migration story first, got ${hybrid[0].chunk.docTitle}`)
  process.exit(1)
}
console.log(`  ok  top hit is ${hybrid[0].chunk.docTitle} (RRF score ${hybrid[0].score.toFixed(4)})`)

// Regenerating has to reground: same query, same top-8 excerpts, same answer back.
const poolDocs: ContextDoc[] = Array.from({ length: 24 }, (_, index) => ({
  id: `pool-${index}`,
  source: 'story',
  title: `Payments story ${index}`,
  createdAt: index,
  text: `A payments reconciliation project I worked on. ${'Extra detail. '.repeat(index + 1)}`,
}))
const poolChunks = poolDocs.flatMap(chunkDoc)

const ids = (results: ReturnType<typeof retrieve>) => results.map((entry) => entry.chunk.id)
const windows = [0, 1, 2].map((rotate) =>
  ids(retrieve('payments reconciliation project', poolChunks, { limit: 8, rotate })),
)

console.log('\nRotation (regenerate regrounds on the rest of the pool)')
for (const [rotate, window] of windows.entries()) {
  if (window.length !== 8) {
    console.error(`FAIL: rotate ${rotate} returned ${window.length} chunks, expected 8`)
    process.exit(1)
  }
  if (new Set(window).size !== window.length) {
    console.error(`FAIL: rotate ${rotate} returned the same chunk twice`)
    process.exit(1)
  }
}

const anchors = windows.map((window) => window.slice(0, 2).join('|'))
if (new Set(anchors).size !== 1) {
  console.error(`FAIL: top hits should survive every rotation, got ${anchors.join(' vs ')}`)
  process.exit(1)
}
console.log(`  ok  top 2 hits anchor every rotation (${windows[0].slice(0, 2).join(', ')})`)

const tails = windows.map((window) => new Set(window.slice(2)))
for (const [left, right] of [
  [0, 1],
  [0, 2],
  [1, 2],
] as const) {
  const shared = [...tails[left]].filter((id) => tails[right].has(id))
  if (shared.length) {
    console.error(`FAIL: rotate ${left} and ${right} share ${shared.length} excerpts`)
    process.exit(1)
  }
}
console.log('  ok  rotations 0, 1 and 2 read entirely different supporting excerpts')

// Wrapping and tiny corpora both have to degrade quietly rather than return nothing.
if (ids(retrieve('payments reconciliation project', poolChunks, { limit: 8, rotate: 3 })).join() !== windows[0].join()) {
  console.error('FAIL: rotation should wrap back to the first window once the pool runs out')
  process.exit(1)
}
const tiny = retrieve('payments', chunks, { limit: 3, rotate: 7 })
if (tiny.length !== 3) {
  console.error(`FAIL: rotating a tiny corpus returned ${tiny.length} chunks, expected 3`)
  process.exit(1)
}
console.log('  ok  rotation wraps, and a corpus smaller than the window is left alone')

const self = cosineSimilarity(axes.leadership, axes.leadership)
if (Math.abs(self - 1) > 1e-9) {
  console.error(`FAIL: cosine self-similarity expected 1, got ${self}`)
  process.exit(1)
}
console.log('  ok  cosine self-similarity is 1')
