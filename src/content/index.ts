import type { ContentRequest, ContentResponse } from '@/lib/messages'
import { errorMessage } from '@/lib/messages'
import { scanQuestions } from './detect'
import { attachFile, fillField, highlightField } from './fill'
import { scrapeJobContext } from './scrape'

declare global {
  interface Window {
    /** Set once the message listener exists, so re-injection on every scan is a no-op. */
    __irkeContentReady?: boolean
  }
}

// Injected on demand by the background at scan time (there is no static content script), and
// injected again on every rescan — the guard keeps one listener no matter how many times.
if (!window.__irkeContentReady) {
  window.__irkeContentReady = true

  chrome.runtime.onMessage.addListener(
    (request: ContentRequest, _sender, sendResponse: (response: ContentResponse) => void) => {
      try {
        switch (request.type) {
          case 'content:scan':
            sendResponse({
              ok: true,
              type: 'scan',
              scan: {
                job: scrapeJobContext(),
                questions: scanQuestions(),
                scannedAt: Date.now(),
              },
            })
            break
          case 'content:fill':
            fillField(request.fieldId, request.value)
            sendResponse({ ok: true, type: 'fill' })
            break
          case 'content:attach':
            attachFile(request.fieldId, request.filename, request.data)
            sendResponse({ ok: true, type: 'attach' })
            break
          case 'content:highlight':
            highlightField(request.fieldId)
            sendResponse({ ok: true, type: 'highlight' })
            break
          default:
            sendResponse({ ok: false, error: 'Unknown request' })
        }
      } catch (error) {
        sendResponse({ ok: false, error: errorMessage(error) })
      }
      return false
    },
  )
}
