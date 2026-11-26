import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Reveal } from '@/features/landing/Reveal'
import { WebinarAgenda } from '@/features/webinar/WebinarAgenda'
import { WebinarForm } from '@/features/webinar/WebinarForm'
import { WebinarHero } from '@/features/webinar/WebinarHero'
import { WebinarReplay } from '@/features/webinar/WebinarReplay'
import { WebinarSpeakers } from '@/features/webinar/WebinarSpeakers'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'webinar' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/webinar'),
    openGraph: {
      title: t('meta.title'),
      description: t('meta.description'),
      url: locale === 'fr' ? '/webinar' : `/${locale}/webinar`,
    },
  }
}

export default async function WebinarPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <WebinarHero />
      <Reveal>
        <WebinarAgenda />
      </Reveal>
      <Reveal>
        <WebinarSpeakers />
      </Reveal>
      <Reveal>
        <WebinarReplay />
      </Reveal>
      <Reveal>
        <WebinarForm />
      </Reveal>
    </SiteLayout>
  )
}
