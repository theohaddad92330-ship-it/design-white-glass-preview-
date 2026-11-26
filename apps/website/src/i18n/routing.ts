import { defineRouting } from 'next-intl/routing'

/**
 * FR is the default locale and keeps clean, prefix-less URLs (`/pricing`) so the
 * existing French site — and its SEO — is untouched. EN lives under `/en/*`,
 * DE (Swiss market, neutral Hochdeutsch) under `/de/*` and NL (Belgian market,
 * standard Dutch) under `/nl/*`.
 * `localePrefix: 'as-needed'` is what makes the default locale prefix-free.
 */
export const routing = defineRouting({
  locales: ['fr', 'en', 'de', 'nl'],
  defaultLocale: 'fr',
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]
