import { selectScanFrames } from '../src/background/scan-frames.ts'

const top = { frameId: 0, parentFrameId: -1, url: 'https://jobs.example.com/role' }

const selected = selectScanFrames([
  top,
  { frameId: 1, parentFrameId: 0, url: 'https://doubleclick.net/pixel' },
  { frameId: 2, parentFrameId: 0, url: 'https://www.googletagmanager.com/gtm' },
  { frameId: 3, parentFrameId: 0, url: 'https://boards.greenhouse.io/embed/job_app?for=acme' },
  { frameId: 4, parentFrameId: 0, url: 'https://jobs.example.com/form' },
  { frameId: 5, parentFrameId: 0, url: 'https://www.youtube.com/embed/abc' },
  { frameId: 6, parentFrameId: 0, url: 'about:blank' },
  ...Array.from({ length: 30 }, (_, i) => ({
    frameId: 10 + i,
    parentFrameId: 0,
    url: `https://cdn.tracker.example/widget-${i}`,
  })),
])

if (!selected.includes(0)) throw new Error('top frame must always be scanned')
if (!selected.includes(3)) throw new Error('Greenhouse embed must outrank trackers')
if (!selected.includes(4)) throw new Error('same-origin form frame should be scanned')
if (!selected.includes(6)) throw new Error('top-level about:blank (ATS shell) should be scanned')
if (selected.includes(1) || selected.includes(2) || selected.includes(5)) {
  throw new Error('ads / analytics / video embeds must not be scanned')
}
if (selected.length > 10) throw new Error(`scan cap is 10, got ${selected.length}`)

console.log(`scan frames  ${selected.length} kept, ads dropped`)
