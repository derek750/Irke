import { ADAPTERS } from '@/content/adapters'

/** Job pages routinely carry dozens of tracker iframes. Scanning all of them stalls the tab. */
export const MAX_SCAN_FRAMES = 10

const SKIP_URL =
  /googleads|doubleclick|googlesyndication|googletagmanager|google-analytics|facebook\.net|connect\.facebook|hotjar|sentry\.io|intercom\.io|newrelic|clarity\.ms|optimizely|segment\.(io|com)|cdn\.amplitude|adsystem|adnxs|criteo|taboola|outbrain|scorecardresearch|quantserve|ads-twitter|platform\.twitter|youtube\.com|player\.vimeo|googletagservices|google\.com\/recaptcha|challenges\.cloudflare/i

const ATS_HOST =
  /(^|\.)(myworkdayjobs\.com|workday\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|icims\.com|successfactors\.com|taleo\.net|jobvite\.com|bamboohr\.com|applytojob\.com|dover\.io)$/i

export interface FrameHint {
  frameId: number
  parentFrameId: number
  url: string
}

/**
 * Prefer the top frame and ATS / same-origin form frames; drop ads, analytics, and CAPTCHA.
 * A cap keeps a 40-iframe job page from injecting and messaging every one of them.
 */
export function selectScanFrames(frames: FrameHint[]): number[] {
  if (!frames.length) return [0]

  const top = frames.find((frame) => frame.frameId === 0)
  const topOrigin = originOf(top?.url ?? '')

  const ranked = frames
    .filter((frame) => isScannable(frame))
    .sort((a, b) => rank(a, topOrigin) - rank(b, topOrigin) || a.frameId - b.frameId)
  const ids = ranked.slice(0, MAX_SCAN_FRAMES).map((frame) => frame.frameId)
  return ids.length ? ids : [0]
}

function isScannable(frame: FrameHint): boolean {
  const url = frame.url || ''
  if (url === 'about:blank') return frame.frameId === 0 || frame.parentFrameId === 0
  if (/^(chrome|chrome-extension|chrome-untrusted|about|javascript|data|blob):/i.test(url)) return false
  if (SKIP_URL.test(url)) return false
  return true
}

function rank(frame: FrameHint, topOrigin: string): number {
  if (frame.frameId === 0) return 0
  if (isAtsFrame(frame.url)) return 1
  const origin = originOf(frame.url)
  if (origin && topOrigin && origin === topOrigin) return 2
  return 3
}

function isAtsFrame(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (ATS_HOST.test(parsed.hostname)) return true
    return ADAPTERS.some((adapter) => adapter.matches(parsed))
  } catch {
    return false
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
