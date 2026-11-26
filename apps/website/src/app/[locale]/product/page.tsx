import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Reveal } from '@/features/landing/Reveal'
import { CapabilityGrid } from '@/features/product/CapabilityGrid'
import { ProductAnatomy } from '@/features/product/ProductAnatomy'
import { ProductContacts } from '@/features/product/ProductContacts'
import { ProductCta } from '@/features/product/ProductCta'
import { ProductHero } from '@/features/product/ProductHero'
import { ProductOrgChart } from '@/features/product/ProductOrgChart'
import { ProductSites } from '@/features/product/ProductSites'
import { AnalysisSpotlight, MessagesSpotlight } from '@/features/product/Spotlights'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'product' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/product'),
  }
}

export default async function ProductPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout className="space-y-28">
      <ProductHero />
      <Reveal>
        <ProductAnatomy />
      </Reveal>
      <AnalysisSpotlight />
      <Reveal>
        <ProductOrgChart />
      </Reveal>
      <MessagesSpotlight />
      <Reveal>
        <ProductSites />
      </Reveal>
      <Reveal>
        <ProductContacts />
      </Reveal>
      <Reveal>
        <CapabilityGrid />
      </Reveal>
      <Reveal>
        <ProductCta />
      </Reveal>
    </SiteLayout>
  )
}
