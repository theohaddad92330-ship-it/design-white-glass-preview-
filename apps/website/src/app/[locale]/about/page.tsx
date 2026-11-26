import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { AboutCta } from '@/features/about/AboutCta'
import { AboutHero } from '@/features/about/AboutHero'
import { Principles } from '@/features/about/Principles'
import { Story } from '@/features/about/Story'
import { Team } from '@/features/about/Team'
import { Reveal } from '@/features/landing/Reveal'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'about' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/about'),
  }
}

export default async function AboutPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <AboutHero />
      <Reveal>
        <Story />
      </Reveal>
      <Reveal>
        <Principles />
      </Reveal>
      <Reveal>
        <Team number="04" />
      </Reveal>
      <Reveal>
        <AboutCta />
      </Reveal>
    </SiteLayout>
  )
}
