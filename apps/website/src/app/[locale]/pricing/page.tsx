import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Reveal } from '@/features/landing/Reveal'
import { Credits } from '@/features/pricing/Credits'
import { PricingCta } from '@/features/pricing/PricingCta'
import { PricingFaq } from '@/features/pricing/PricingFaq'
import { PricingHero } from '@/features/pricing/PricingHero'
import { PricingPlans } from '@/features/pricing/PricingPlans'
import { fetchLiveCatalogCopy } from '@/features/pricing/live-prices'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'pricing' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/pricing'),
  }
}

export default async function PricingPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  // Live catalog figures; anything missing falls back to the message catalog.
  const live = await fetchLiveCatalogCopy()
  return (
    <SiteLayout>
      <PricingHero />
      <PricingPlans live={live} />
      <Reveal>
        <Credits />
      </Reveal>
      <Reveal>
        <PricingFaq live={live} />
      </Reveal>
      <Reveal>
        <PricingCta />
      </Reveal>
    </SiteLayout>
  )
}
