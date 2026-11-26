import type { AbstractIntlMessages } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

/**
 * Message catalogs are split per feature namespace under `messages/<locale>/`.
 * Each file becomes a top-level namespace (its filename) in the message tree —
 * e.g. `messages/en/pricing.json` is reachable via `useTranslations('pricing')`.
 * Keep this list in sync with the files that exist for ALL locales.
 */
const NAMESPACES = [
  'common',
  'home',
  'pricing',
  'product',
  'about',
  'useCases',
  'demo',
  'beta',
  'webinar',
  'legal',
  'status',
  'chatbot',
  'safeguards',
] as const

async function loadMessages(locale: string): Promise<AbstractIntlMessages> {
  const entries = await Promise.all(
    NAMESPACES.map(async namespace => {
      const mod = (await import(`../../messages/${locale}/${namespace}.json`)) as { default: AbstractIntlMessages }
      return [namespace, mod.default] as const
    }),
  )
  return Object.fromEntries(entries)
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = routing.locales.includes(requested as (typeof routing.locales)[number])
    ? (requested as string)
    : routing.defaultLocale

  return {
    locale,
    messages: await loadMessages(locale),
  }
})
