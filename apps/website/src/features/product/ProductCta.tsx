import { Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { signupUrl } from '@/lib/app-url'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'

export function ProductCta() {
  const t = useTranslations('product')
  return (
    <section className="relative overflow-hidden py-28">
      <div className="pointer-events-none absolute left-1/2 top-[30px] h-[340px] w-[220px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.45),transparent_70%)] blur-[80px]" />

      <div className="relative z-10 mx-auto max-w-2xl animate-fade-up px-6 text-center">
        <Text element="h2" weight="medium" color="text-white" className="text-[clamp(32px,4vw,48px)] leading-tight">
          {t('cta.title')}
        </Text>
        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-md leading-relaxed">
          {t('cta.desc')}
        </Text>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={signupUrl()} className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}>
            {t('cta.ctaPrimary')}
          </a>
          <Link href="/demo" className={cn(GLASS_BUTTON, 'w-full sm:w-auto')}>
            {t('cta.ctaSecondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
