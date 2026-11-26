import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteLayout } from '@/components/SiteLayout'
import { DemoForm } from '@/features/demo/DemoForm'
import { DemoIntro } from '@/features/demo/DemoIntro'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'demo' })
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: buildAlternates(locale as Locale, '/demo'),
  }
}

export default async function DemoPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  return (
    <SiteLayout>
      <section className="relative my-auto h-dvh items-center overflow-hidden pb-24 pt-64">
        <div className="pointer-events-none absolute -left-[100px] -top-[120px] h-[460px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.5),transparent_70%)] opacity-40 blur-[70px]" />

        <div className="relative z-10 mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
          <DemoIntro />
          <div className="animate-fade-up">
            <DemoForm />
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
