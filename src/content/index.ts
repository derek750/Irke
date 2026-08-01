import type { ContentRequest, ContentResponse } from '@/lib/messages'
import { errorMessage } from '@/lib/messages'
import { scanQuestions } from './detect'
import { fillField, highlightField } from './fill'
import { scrapeJobContext } from './scrape'

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
