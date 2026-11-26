import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { BetaFaq } from '@/features/beta/BetaFaq'
import { BetaForm } from '@/features/beta/BetaForm'
import { BetaHero } from '@/features/beta/BetaHero'
import { BetaHow } from '@/features/beta/BetaHow'
import { BetaOffer } from '@/features/beta/BetaOffer'
import { BetaScreens } from '@/features/beta/BetaScreens'
import { Reveal } from '@/features/landing/Reveal'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'beta' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/beta'),
  }
}

export default async function BetaPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <BetaHero />
      <Reveal>
        <BetaHow />
      </Reveal>
      <Reveal>
        <BetaScreens />
      </Reveal>
      <Reveal>
        <BetaOffer />
      </Reveal>
      <Reveal>
        <BetaFaq />
      </Reveal>
      <Reveal>
        <BetaForm />
      </Reveal>
    </SiteLayout>
  )
}
