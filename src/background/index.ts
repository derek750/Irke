import { rememberAnswer } from '@/lib/answer-bank'
import type { BackgroundRequest, BackgroundResponse } from '@/lib/messages'
import { errorMessage, sendToTab } from '@/lib/messages'
import { generateAnswer } from './generate'

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
  if (reason === 'install') await chrome.runtime.openOptionsPage()
})

chrome.runtime.onMessage.addListener(
  (request: BackgroundRequest, _sender, sendResponse: (response: BackgroundResponse) => void) => {
    handle(request)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }))
    return true
  },
)

async function handle(request: BackgroundRequest): Promise<BackgroundResponse> {
  switch (request.type) {
    case 'bg:scanActiveTab': {
      const tabId = await activeTabId()
      return scanTab(tabId)
    }

    case 'bg:generate': {
      const result = await generateAnswer({
        job: request.job,
        question: request.question,
        regenerate: request.regenerate,
        extraInstructions: request.extraInstructions,
      })
      return { ok: true, type: 'generate', result }
    }

    case 'bg:fill': {
      const tabId = await activeTabId()
      const response = await sendToTab(
        tabId,
        { type: 'content:fill', fieldId: request.fieldId, value: request.value },
        request.frameId,
      )
      if (!response.ok) return response
      return { ok: true, type: 'fill' }
    }

    case 'bg:saveAnswer': {
      await rememberAnswer(request)
      return { ok: true, type: 'saveAnswer' }
    }

    default:
      return { ok: false, error: 'Unknown request' }
  }
}

/**
 * ATS forms are often embedded in an iframe while the job description sits in the top frame,
 * so every frame is scanned and the one with the most fields wins. The top frame supplies the
 * job context when the winning frame is a bare form with no description.
 */
async function scanTab(tabId: number): Promise<BackgroundResponse> {
  const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null)
  const frameIds = frames?.length ? frames.map((frame) => frame.frameId) : [0]

  const scans = await Promise.all(
    frameIds.map(async (frameId) => {
      const response = await sendToTab(tabId, { type: 'content:scan' }, frameId)
      return response.ok && response.type === 'scan' ? { frameId, scan: response.scan } : null
    }),
  )

  const reachable = scans.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (!reachable.length) {
    return {
      ok: false,
      error: 'Cannot reach this page. Reload the tab after installing Irke, then try again.',
    }
  }

  const best = reachable.reduce((winner, entry) =>
    entry.scan.questions.length > winner.scan.questions.length ? entry : winner,
  )
  const topFrame = reachable.find((entry) => entry.frameId === 0)

  const job =
    best.scan.job.descriptionText.length > 400 || !topFrame
      ? best.scan.job
      : { ...topFrame.scan.job, ats: best.scan.job.ats }

  return {
    ok: true,
    type: 'scan',
    scan: { ...best.scan, job, frameId: best.frameId },
  }
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab.')
  return tab.id
}
