export interface AtsAdapter {
  id: string
  name: string
  matches: (url: URL) => boolean
  /** Selectors tried in order to find the job description body. */
  descriptionSelectors: string[]
  /** Selectors tried in order to find the company name. */
  companySelectors: string[]
  titleSelectors: string[]
  /** Container that holds the application form, if the ATS has a stable one. */
  formSelectors: string[]
}

const GENERIC_DESCRIPTION_SELECTORS = [
  '[class*="job-description" i]',
  '[class*="jobDescription" i]',
  '[id*="job-description" i]',
  '[data-testid*="description" i]',
  'article',
  'main',
]

export const ADAPTERS: AtsAdapter[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    matches: (url) => /(^|\.)(greenhouse\.io|job-boards\.greenhouse\.io)$/.test(url.hostname),
    descriptionSelectors: ['#content', '.job__description', '[class*="job__description"]'],
    companySelectors: ['.company-name', '[class*="company-name"]', 'header h1'],
    titleSelectors: ['.app-title', '.job__title h1', 'h1'],
    formSelectors: ['#application-form', '#application_form', 'form'],
  },
  {
    id: 'lever',
    name: 'Lever',
    matches: (url) => /(^|\.)lever\.co$/.test(url.hostname),
    descriptionSelectors: ['.section-wrapper .content', '[data-qa="job-description"]', '.posting-page'],
    companySelectors: ['.main-header-logo img', '.posting-header .company'],
    titleSelectors: ['.posting-headline h2', 'h2'],
    formSelectors: ['.application-form', 'form'],
  },
  {
    id: 'ashby',
    name: 'Ashby',
    matches: (url) => /(^|\.)ashbyhq\.com$/.test(url.hostname),
    descriptionSelectors: ['[class*="_descriptionText"]', '[class*="jobDescription"]', 'main'],
    companySelectors: ['[class*="_organizationName"]', 'header h1'],
    titleSelectors: ['h1', '[class*="_title"]'],
    formSelectors: ['form'],
  },
  {
    id: 'workable',
    name: 'Workable',
    matches: (url) => /(^|\.)workable\.com$/.test(url.hostname),
    descriptionSelectors: ['[data-ui="job-description"]', 'section[data-ui="job-description"]', 'main'],
    companySelectors: ['[data-ui="company-name"]', 'header h3'],
    titleSelectors: ['[data-ui="job-title"]', 'h1'],
    formSelectors: ['form'],
  },
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    matches: (url) => /(^|\.)smartrecruiters\.com$/.test(url.hostname),
    descriptionSelectors: ['.job-sections', '[itemprop="description"]', 'main'],
    companySelectors: ['[itemprop="hiringOrganization"]', '.company-name'],
    titleSelectors: ['h1[itemprop="title"]', 'h1'],
    formSelectors: ['form'],
  },
]

const GENERIC_ADAPTER: AtsAdapter = {
  id: 'generic',
  name: 'Generic form',
  matches: () => true,
  descriptionSelectors: GENERIC_DESCRIPTION_SELECTORS,
  companySelectors: ['[class*="company" i]', 'header h2', 'header h1'],
  titleSelectors: ['h1', 'h2'],
  formSelectors: ['form'],
}

export function resolveAdapter(href: string): AtsAdapter {
  try {
    const url = new URL(href)
    return ADAPTERS.find((adapter) => adapter.matches(url)) ?? GENERIC_ADAPTER
  } catch {
    return GENERIC_ADAPTER
  }
}
