import type { PageSpec } from '../../types'
import { aboutPage } from './about'
import { betaPage } from './beta'
import { cguPage } from './cgu'
import { cgvPage } from './cgv'
import { cookiesPage } from './cookies'
import { demoPage } from './demo'
import { dpaPage } from './dpa'
import { homePage } from './home'
import { legalPage } from './legal'
import { notFoundPage } from './not-found'
import { pricingPage } from './pricing'
import { privacyPage } from './privacy'
import { productPage } from './product'
import { safeguardsPage } from './safeguards'
import { statusPage } from './status'
import { useCasesPage } from './use-cases'
import { webinarPage } from './webinar'

/** Les pages du site public (apps/website, 17 pages) — gabarit `marketing` surtout. */
export const SITE_PAGES: readonly PageSpec[] = [
  homePage,
  productPage,
  pricingPage,
  useCasesPage,
  aboutPage,
  betaPage,
  demoPage,
  webinarPage,
  safeguardsPage,
  statusPage,
  cguPage,
  cgvPage,
  cookiesPage,
  dpaPage,
  legalPage,
  privacyPage,
  notFoundPage,
]
