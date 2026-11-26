import { Text, cn } from '@bellum/ui'
import { ArrowRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'

type Fact = { value: string; label: string }

export function WebinarHero() {
  const t = useTranslations('webinar.hero')
  const facts = t.raw('facts') as Fact[]
  const reassure = t.raw('reassure') as string[]

  return (
    <section className="relative overflow-hidden pb-16 pt-36 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(124,58,237,0.22),transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-3xl animate-fade-up px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-4 py-1.5">
          <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <Text element="span" size="xs" className="text-violet-200">
            {t('badge')}
          </Text>
        </span>

        <Text
          element="h1"
          weight="medium"
          color="text-white"
          leading="tight"
          className="mt-6 text-balance text-3xl lg:text-5xl"
        >
          {t('titleLead')}
          <br />
          <span className="text-gradient-em font-bold">{t('titleHighlight')}</span>
        </Text>

        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-5 max-w-xl leading-relaxed">
          {t('subtitle')}
        </Text>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="#inscription" className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}>
            {t('primaryCta')}
            <ArrowRight size={18} />
          </a>
          <a href="#programme" className={cn(GLASS_BUTTON, 'w-full sm:w-auto')}>
            {t('secondaryCta')}
          </a>
        </div>

        <div className="mt-10 flex items-center justify-center gap-6">
          {facts.map((fact, index) => (
            <div key={fact.label} className={cn(index > 0 && 'border-l border-white/10 pl-6')}>
              <Text element="div" weight="semibold" className="text-2xl text-white">
                {fact.value}
              </Text>
              <Text element="div" size="xs" color="text-zinc-500" className="mt-0.5">
                {fact.label}
              </Text>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {reassure.map(item => (
            <span key={item} className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
              <Check size={14} className="text-emerald-400" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
