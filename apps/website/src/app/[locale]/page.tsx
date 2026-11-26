import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Team } from '@/features/about/Team'
import { About } from '@/features/landing/About'
import { Enrichment } from '@/features/landing/Enrichment'
import { Faq } from '@/features/landing/Faq'
import { FeaturesSection } from '@/features/landing/FeaturesSection'
import { FinalCta } from '@/features/landing/FinalCta'
import { Hero } from '@/features/landing/Hero'
import { HowSection } from '@/features/landing/HowSection'
import { Integrations } from '@/features/landing/Integrations'
import { LogoBand } from '@/features/landing/LogoBand'
import { Metrics } from '@/features/landing/Metrics'
import { Orchestration } from '@/features/landing/Orchestration'
import { Pricing } from '@/features/landing/Pricing'
import { ProblemSection } from '@/features/landing/ProblemSection'
import { Reveal } from '@/features/landing/Reveal'
import { Security } from '@/features/landing/Security'
import { Testimonials } from '@/features/landing/Testimonials'
import { UseCasesPreview } from '@/features/landing/UseCasesPreview'
import { fetchLiveCatalogCopy } from '@/features/pricing/live-prices'
import { structuredDataEntryPrice } from '@/features/pricing/structured-data-price'
import { SITE_URL } from '@/lib/app-url'

type FaqItem = { q: string; a: string }

export default async function HomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'home' })

  // Live catalog figures; anything missing falls back to the message catalogs.
  const live = await fetchLiveCatalogCopy()
  /**
   * Le prix annoncé dans la donnée structurée — celui que Google indexe et peut
   * afficher dans ses résultats, souvent avant que le visiteur n'ouvre la page.
   *
   * Il vient du catalogue live, sinon de LA CARTE que la section Tarifs affiche
   * plus bas, sinon de rien du tout. Aucun chiffre n'est écrit ici : la ligne
   * précédente disait `?? '119'` et publiait donc le prix de `starter`, retiré
   * de la vente le 27/08, à chaque fois que la requête catalogue échouait.
   * `no-hardcoded-price.test.ts` interdit qu'un montant y revienne.
   */
  const entryPrice = structuredDataEntryPrice(live, t.raw('pricing.plans'))

  const faqItems = t.raw('faq.items') as FaqItem[]
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BellumAI',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: t('jsonLd.softwareDescription'),
    // Pas de prix connu, pas d'offre. `SoftwareApplication` n'exige pas
    // `offers` ; un `Offer`, lui, exige un prix — et un prix deviné serait une
    // promesse commerciale que Stripe ne tiendrait pas. « Absent » est vrai.
    ...(entryPrice
      ? {
          offers: {
            '@type': 'Offer',
            price: entryPrice,
            priceCurrency: 'EUR',
            description: t('jsonLd.offerDescription', { entryPrice }),
          },
        }
      : {}),
    featureList: t.raw('jsonLd.featureList') as string[],
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BellumAI',
    url: SITE_URL,
    inLanguage: { fr: 'fr-FR', en: 'en-US', de: 'de-DE', nl: 'nl-BE' }[locale] ?? 'fr-FR',
    publisher: { '@type': 'Organization', name: 'BellumAI', url: SITE_URL },
  }

  return (
    <SiteLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <Hero />
      <Reveal>
        <LogoBand />
      </Reveal>
      <Reveal>
        <Metrics />
      </Reveal>
      <Reveal>
        <ProblemSection />
      </Reveal>
      <Reveal>
        <HowSection />
      </Reveal>
      <Reveal>
        <FeaturesSection />
      </Reveal>
      <Reveal>
        <Orchestration />
      </Reveal>
      <Reveal>
        <Enrichment />
      </Reveal>
      <Reveal>
        <Integrations />
      </Reveal>
      <Reveal>
        <UseCasesPreview />
      </Reveal>
      <Reveal>
        <Testimonials />
      </Reveal>
      <Reveal>
        <Security />
      </Reveal>
      <Reveal>
        <Pricing live={live} />
      </Reveal>
      <Reveal>
        <Faq />
      </Reveal>
      <Reveal>
        <About />
      </Reveal>
      <Reveal>
        <Team />
      </Reveal>
      <Reveal>
        <FinalCta />
      </Reveal>
    </SiteLayout>
  )
}
