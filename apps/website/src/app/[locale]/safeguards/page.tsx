import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Reveal } from '@/features/landing/Reveal'
import { ClaimSection } from '@/features/safeguards/ClaimSection'
import { SafeguardsCta } from '@/features/safeguards/SafeguardsCta'
import { SafeguardsHero } from '@/features/safeguards/SafeguardsHero'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

/**
 * `/safeguards` — ce que le produit refuse de faire.
 *
 * L'URL reste en anglais comme toutes les routes du site (`/product`,
 * `/use-cases`, `/pricing`) : `localePrefix: 'as-needed'` sert le MÊME chemin
 * aux quatre langues, seul le préfixe change. Un slug français ferait lire
 * `/en/ce-que-nous-ne-faisons-pas` à un anglophone.
 */
export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'safeguards' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/safeguards'),
  }
}

export default async function SafeguardsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <SafeguardsHero />
      <Reveal>
        <ClaimSection section="copilot" />
      </Reveal>
      <Reveal>
        <ClaimSection section="guardrails" />
      </Reveal>
      <Reveal>
        <ClaimSection section="review" />
      </Reveal>
      <Reveal>
        <ClaimSection section="refusals" />
      </Reveal>
      <Reveal>
        <SafeguardsCta />
      </Reveal>
    </SiteLayout>
  )
}
