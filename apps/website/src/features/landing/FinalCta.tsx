import { Text } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { demoUrl, signupUrl } from '@/lib/app-url'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'

export function FinalCta() {
  const t = useTranslations('home.finalCta')

  return (
    <section className="relative overflow-hidden py-28">
      <div className="pointer-events-none absolute left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.5),transparent_70%)] blur-[70px] opacity-50" />

      <div className="relative z-10 mx-auto max-w-2xl animate-fade-up px-6 text-center">
        <Text element="h2" weight="medium" className="text-glow-head text-[clamp(32px,4.5vw,52px)] leading-tight">
          {t('heading')}
        </Text>
        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-5 max-w-md">
          {t('paragraph')}
        </Text>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={signupUrl()} className={PRIMARY_BUTTON}>
            {t('ctaPrimary')}
            <ArrowRight size={18} />
          </a>
          <a href={demoUrl()} className={GLASS_BUTTON}>
            {t('ctaSecondary')}
          </a>
        </div>
      </div>
    </section>
  )
}
