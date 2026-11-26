import { Text } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

export function About() {
  const t = useTranslations('home.about')

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="relative animate-fade-up overflow-hidden rounded-3xl border border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-10 text-center backdrop-blur-[16px] sm:p-16">
          <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[120%] w-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.3),transparent_70%)] blur-[70px]" />

          <div className="relative mx-auto max-w-2xl">
            <div className="flex justify-center">
              <Kicker center>{t('kicker')}</Kicker>
            </div>
            <Text
              element="h2"
              weight="medium"
              color="text-white"
              className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
            >
              {t('heading')}
            </Text>
            <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
              {t('paragraph')}
            </Text>
            <Link
              href="/about"
              className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
            >
              {t('cta')}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
