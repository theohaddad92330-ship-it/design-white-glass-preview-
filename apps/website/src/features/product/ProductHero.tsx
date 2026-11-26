import { Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { signupUrl } from '@/lib/app-url'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'

export function ProductHero() {
  const t = useTranslations('product')
  return (
    <section className="relative overflow-hidden pb-16 pt-36 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(124,58,237,0.22),transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-3xl animate-fade-up px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
          <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <Text element="span" size="xs" className="text-violet-200">
            {t('hero.badge')}
          </Text>
        </span>

        <Text
          element="h1"
          weight="medium"
          color="text-white"
          leading="tight"
          className="mt-6 text-balance text-3xl lg:text-5xl"
        >
          {t('hero.title')}
        </Text>

        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-5 max-w-xl leading-relaxed">
          {t('hero.desc')}
        </Text>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={signupUrl()} className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}>
            {t('hero.ctaPrimary')}
          </a>
          <Link href="/demo" className={cn(GLASS_BUTTON, 'w-full sm:w-auto')}>
            {t('hero.ctaSecondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
