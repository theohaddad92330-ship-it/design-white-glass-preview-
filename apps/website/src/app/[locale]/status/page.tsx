import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { StatusBoard } from '@/features/status/StatusBoard'
import { StatusHero } from '@/features/status/StatusHero'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'status' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/status'),
  }
}

/**
 * Public system-status page (v1 = honest realtime): the client board polls the
 * same-origin `/api/status` proxy every 30s, which forwards to the API's
 * `GET /status` (dependency checks cached 15s server-side).
 *
 * Future evolution (deliberately NOT in v1): persisted uptime history and an
 * incident log — that needs storage for check results + an operator surface to
 * post incident updates, and pairs naturally with an external uptime monitor
 * pinging `GET /status` from outside our infra (a dead API cannot self-report).
 */
export default async function StatusPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <StatusHero />
      <StatusBoard />
    </SiteLayout>
  )
}
