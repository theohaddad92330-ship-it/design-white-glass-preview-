import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { Personas } from '@/features/use-cases/Personas'
import { UseCasesCta } from '@/features/use-cases/UseCasesCta'
import { UseCasesHero } from '@/features/use-cases/UseCasesHero'
import { UseCasesList } from '@/features/use-cases/UseCasesList'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'useCases' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/use-cases'),
  }
}

export default async function UseCasesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <UseCasesHero />
      <UseCasesList />
      <Personas />
      <UseCasesCta />
    </SiteLayout>
  )
}
