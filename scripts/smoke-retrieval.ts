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

// When the channels disagree about the best chunk, the vector channel's pick wins the fusion:
// keywords favor the "Why payments" story here, the leadership axis favors the migration story.
const disagreement = retrieve('payments infrastructure correctness', embedded, {
  limit: 2,
  queryEmbedding: axes.leadership,
})
if (disagreement[0]?.chunk.docId !== 'story-migration') {
  console.error(
    `FAIL: weighted RRF should let the vector pick outrank the keyword pick, got ${disagreement[0]?.chunk.docTitle}`,
  )
  process.exit(1)
}
if (!disagreement.some((entry) => entry.chunk.docId === 'story-why-payments')) {
  console.error('FAIL: the keyword pick should still make the window, not vanish')
  process.exit(1)
}
console.log('  ok  when channels disagree, the vector pick leads and the keyword pick stays in the window')

// A job description is ~80 terms and a question label is ~5, so an unweighted query is a search
// for the job description and every question on the page retrieves the same excerpts.
const jd = [
  'Software Engineer, Payments Platform. You will build and maintain payment services in Go and',
  'Postgres, improve reconciliation tooling, and own the reliability of systems that move money.',
  'Requirements: a systems language, strong communication, care for correctness in production.',
].join(' ')

const asked = {
  'Tell us about a time an estimate slipped.': 'The migration that slipped a quarter',
  'Why do you want to work on payments?': 'Why payments',
  'Tell us about a tool you built for reconciling ledgers.': 'derek/ledger-tools',
}

console.log('\nQuery weighting (the question has to outrank the job description)')
const flatHits = Object.keys(asked).map(
  (label) => retrieve(`${label}\nSoftware Engineer\n${jd}`, chunks, { limit: 3 })[0]?.chunk.docTitle,
)
if (new Set(flatHits).size !== 1) {
  console.error(`FAIL: expected the flat query to collapse every question, got ${flatHits.join(' vs ')}`)
  process.exit(1)
}
console.log(
  `  ok  unweighted, all ${flatHits.length} questions retrieve the same thing first (${flatHits[0]})`,
)

for (const [label, expected] of Object.entries(asked)) {
  const top = retrieve(
    [
      { text: label, weight: 10 },
      { text: 'Software Engineer', weight: 2 },
      { text: jd, weight: 1 },
    ],
    chunks,
    { limit: 3 },
  )[0]?.chunk.docTitle
  if (top !== expected) {
    console.error(`FAIL: "${label}" should retrieve "${expected}" first, got "${top}"`)
    process.exit(1)
  }
}
console.log('  ok  weighted, each question retrieves its own story first')

// The absolute minScore passes almost everything once the JD is in the query; the useful cutoff
// is relative to the best hit for that query, so a pointed question comes back narrow.
const pointed = retrieve(
  [
    { text: 'Tell us about a tool you built for reconciling ledgers.', weight: 10 },
    { text: jd, weight: 1 },
  ],
  chunks,
  { limit: 8 },
)
if (pointed.length >= chunks.length) {
  console.error(`FAIL: a pointed question returned the whole corpus (${pointed.length} chunks)`)
  process.exit(1)
}
console.log(`  ok  relevance floor trims a pointed question to ${pointed.length} of ${chunks.length} chunks`)

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

// Distilled notes are LLM-condensed search cards over the user's material. A question phrased
// in card vocabulary finds the card, and the card chains its parent document in right behind
// it — the card names the story, the original carries its texture.
console.log('\nDistilled notes (cards hit, parents chain in behind them)')
const layeredDocs: ContextDoc[] = [
  ...docs,
  {
    id: 'distilled:story-migration',
    source: 'distilled',
    title: 'Notes — The migration that slipped a quarter',
    createdAt: 50,
    text: [
      '## Story: Missed deadline on a payments migration',
      'Type: deadline, failure, estimation, ownership',
      'Situation: a two-month payments reconciliation migration took five; legacy cron scripts hid undocumented behavior.',
      'Action: paused to write characterization tests before continuing.',
      'Outcome: shipped with zero incidents.',
    ].join('\n'),
  },
]
const layeredChunks = layeredDocs.flatMap(chunkDoc)
const deadlineWindow = retrieve(
  [
    { text: 'Describe a situation where you missed a deadline.', weight: 10 },
    { text: jd, weight: 1 },
  ],
  layeredChunks,
  { limit: 4 },
)
const deadlineIds = ids(deadlineWindow).map((id) => id.split(':').slice(0, -1).join(':') || id)
const cardAt = deadlineWindow.findIndex((entry) => entry.chunk.docId === 'distilled:story-migration')
const parentAt = deadlineWindow.findIndex((entry) => entry.chunk.docId === 'story-migration')
if (cardAt === -1) {
  console.error(`FAIL: the deadline question should find the distilled card, got ${deadlineIds.join(', ')}`)
  process.exit(1)
}
if (parentAt !== cardAt + 1) {
  console.error(`FAIL: the card's parent should chain in directly behind it (card ${cardAt}, parent ${parentAt})`)
  process.exit(1)
}
if (!deadlineWindow[cardAt].chunk.text.startsWith('[DISTILLED NOTES]')) {
  console.error('FAIL: distilled chunks should carry the [DISTILLED NOTES] tag')
  process.exit(1)
}
console.log('  ok  a question in card vocabulary finds the card, with the original chained behind it')

// Stored chunk tokens are exact words, so "migrating" cannot match a chunk that only says
// "migration" — unless the query side expands each term into its morphological family.
console.log('\nQuery-side variants (paraphrase inflections match)')
const inflected = retrieve(
  [
    { text: 'Tell us about migrating a legacy service.', weight: 10 },
    { text: jd, weight: 1 },
  ],
  chunks,
  { limit: 3 },
)
if (inflected[0]?.chunk.docId !== 'story-migration') {
  console.error(`FAIL: "migrating" should reach the story that says "migration", got ${inflected[0]?.chunk.docTitle}`)
  process.exit(1)
}
console.log('  ok  "migrating" retrieves the story that only says "migration"')

// A steer is the user saying which material to write from. Its best hits are pinned to the
// front of the window and marked; the rest of the window stays the question's.
console.log('\nSteering (extra instructions reach retrieval)')
const whyPayments = [
  { text: 'Why do you want to work on payments?', weight: 10 },
  { text: jd, weight: 1 },
]

const unsteeredWindow = retrieve(whyPayments, chunks, { limit: 3 })
const steeredWindow = retrieve(whyPayments, chunks, { limit: 3, steer: 'mention the ledger tools I built' })
if (steeredWindow[0]?.chunk.docId !== 'github-ledger' || !steeredWindow[0]?.steered) {
  console.error(`FAIL: steer should pin ledger-tools first and mark it, got ${steeredWindow[0]?.chunk.docTitle}`)
  process.exit(1)
}
if (!steeredWindow.some((entry) => entry.chunk.id === unsteeredWindow[0]?.chunk.id)) {
  console.error('FAIL: steering displaced the question\'s own best excerpt (should cost the tail, not the head)')
  process.exit(1)
}
console.log('  ok  steer pins its material first, marked, and the question keeps its best excerpt')

const keywordWindow = retrieve(whyPayments, chunks, { limit: 3, steer: 'ledger' })
if (keywordWindow[0]?.chunk.docId !== 'github-ledger') {
  console.error(`FAIL: a single-keyword steer should still pin, got ${keywordWindow[0]?.chunk.docTitle}`)
  process.exit(1)
}
console.log('  ok  a single-keyword steer works')

for (const idle of ['keep it short and friendly', 'mention my Olympic gold medal']) {
  const idleWindow = retrieve(whyPayments, chunks, { limit: 3, steer: idle })
  if (ids(idleWindow).join() !== ids(unsteeredWindow).join()) {
    console.error(`FAIL: steer "${idle}" names nothing in the index but moved the window`)
    process.exit(1)
  }
}
console.log('  ok  tone-only and absent-material steers leave retrieval untouched')

// Steered hybrid: pins are applied after RRF fusion, so they win over the vector channel too.
const steeredHybrid = retrieve(whyPayments, embedded, {
  limit: 2,
  queryEmbedding: axes.payments,
  steer: 'the migration that slipped a quarter',
})
if (steeredHybrid[0]?.chunk.docId !== 'story-migration' || !steeredHybrid[0]?.steered) {
  console.error(`FAIL: steer should outrank the vector channel, got ${steeredHybrid[0]?.chunk.docTitle}`)
  process.exit(1)
}
console.log('  ok  steer pins survive hybrid RRF fusion')

// A steered regenerate keeps the steered excerpt while the rest of the window rotates.
const steerPoolDocs: ContextDoc[] = [
  ...poolDocs,
  {
    id: 'pool-cubesat',
    source: 'story',
    title: 'CubeSat power budget',
    createdAt: 99,
    text: 'I rebuilt the CubeSat power budget from telemetry and wrote load-shedding firmware for the battery.',
  },
]
const steerPoolChunks = steerPoolDocs.flatMap(chunkDoc)
const steeredRotations = [0, 1, 2].map((rotate) =>
  retrieve('payments reconciliation project', steerPoolChunks, {
    limit: 8,
    rotate,
    steer: 'the CubeSat power budget work',
  }),
)
for (const [rotate, window] of steeredRotations.entries()) {
  if (window[0]?.chunk.docId !== 'pool-cubesat') {
    console.error(`FAIL: rotate ${rotate} lost the steered excerpt (got ${window[0]?.chunk.docTitle})`)
    process.exit(1)
  }
}
if (new Set(steeredRotations.map((window) => ids(window).join('|'))).size !== 3) {
  console.error('FAIL: steered rotations should still reground the unpinned slots')
  process.exit(1)
}
console.log('  ok  steered regenerates keep the steered excerpt while the rest rotates')

const self = cosineSimilarity(axes.leadership, axes.leadership)
if (Math.abs(self - 1) > 1e-9) {
  console.error(`FAIL: cosine self-similarity expected 1, got ${self}`)
  process.exit(1)
}
console.log('  ok  cosine self-similarity is 1')
