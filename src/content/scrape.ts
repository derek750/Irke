import type { JobContext } from '@/lib/types'
import { resolveAdapter } from './adapters'

const MAX_DESCRIPTION_CHARS = 12_000

export function scrapeJobContext(): JobContext {
  const adapter = resolveAdapter(location.href)

  return {
    url: location.href,
    title: firstText(adapter.titleSelectors) ?? cleanDocumentTitle(),
    company: resolveCompany(adapter.companySelectors),
    descriptionText: resolveDescription(adapter.descriptionSelectors),
    ats: adapter.name,
  }
}

function resolveDescription(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    const text = element?.innerText?.trim()
    if (text && text.length > 200) return collapse(text).slice(0, MAX_DESCRIPTION_CHARS)
  }
  return collapse(document.body?.innerText ?? '').slice(0, MAX_DESCRIPTION_CHARS)
}

function resolveCompany(selectors: string[]): string {
  const ogSiteName = document
    .querySelector<HTMLMetaElement>('meta[property="og:site_name"]')
    ?.content?.trim()
  if (ogSiteName) return ogSiteName

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element instanceof HTMLImageElement && element.alt.trim()) return collapse(element.alt)
    const text = element?.textContent?.trim()
    if (text && text.length < 80) return collapse(text)
  }

  return hostnameLabel()
}

function firstText(selectors: string[]): string | null {
  for (const selector of selectors) {
    const text = document.querySelector<HTMLElement>(selector)?.textContent?.trim()
    if (text && text.length < 200) return collapse(text)
  }
  return null
}

function cleanDocumentTitle(): string {
  return collapse(document.title.split(/[|\u2013\u2014-]/)[0] ?? document.title)
}

function hostnameLabel(): string {
  const parts = location.hostname.replace(/^www\./, '').split('.')
  return parts[0] ?? location.hostname
}

function collapse(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
