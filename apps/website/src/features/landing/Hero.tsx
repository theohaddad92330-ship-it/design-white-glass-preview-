import { Text, cn } from '@bellum/ui'
import { ArrowRight, Check, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { demoUrl, signupUrl } from '@/lib/app-url'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'
import { DashboardMockup } from './DashboardMockup'

type Stat = { value: string; label: string }

export function Hero() {
  const t = useTranslations('home.hero')
  const stats = t.raw('stats') as Stat[]
  const reassure = t.raw('reassure') as string[]

  return (
    <section className="relative overflow-hidden pb-16 pt-32 lg:pb-24 lg:pt-40">
      <div className="pointer-events-none absolute -left-[180px] -top-[120px] h-[520px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.5),transparent_70%)] blur-[70px] opacity-50" />
      <div className="pointer-events-none absolute -bottom-10 -right-[120px] h-[420px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(77,157,255,0.38),transparent_70%)] blur-[70px] opacity-30" />

      <div className="relative z-10 mx-auto grid max-w-[1340px] min-h-[700px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="animate-fade-up text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
            <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
            <Text element="span" size="sm" className="text-violet-200">
              {t('badge')}
            </Text>
          </span>

          <Text
            element="h1"
            weight="bold"
            className="mt-6 text-balance text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl"
          >
            {t('titleLine1')}
            <br />
            <span className="font-light text-zinc-300">
              {t('titleLine2Prefix')}
              <span className="text-gradient-em font-bold">{t('titleEm')}</span>
            </span>
          </Text>

          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-5 max-w-xl leading-relaxed lg:mx-0">
            {t('paragraphPrefix')}
            <span className="font-semibold text-white">{t('paragraphStrong')}</span>.
          </Text>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
            <a href={signupUrl()} className={PRIMARY_BUTTON}>
              {t('ctaPrimary')}
              <ArrowRight size={18} />
            </a>
            {/* La démonstration s'OUVRE, elle ne se demande plus : un clic loue
                une salle au visiteur, sans compte et sans crédit consommé. Le
                formulaire de demande reste accessible (pied de page) pour ceux
                qui veulent parler à quelqu'un. */}
            <a href={demoUrl()} className={GLASS_BUTTON}>
              <Play size={16} className="fill-current" />
              {t('ctaSecondary')}
            </a>
          </div>

          <div className="mt-10 flex items-center justify-center gap-6 lg:justify-start">
            {stats.map((stat, index) => (
              <div key={stat.label} className={cn(index > 0 && 'border-l border-white/10 pl-6')}>
                <Text element="h2" weight="semibold" className="text-2xl text-white">
                  {stat.value}
                </Text>
                <Text element="div" size="xs" color="text-zinc-500" className="mt-0.5">
                  {stat.label}
                </Text>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
            {reassure.map(item => (
              <span key={item} className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
                <Check size={14} className="text-green-500" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-fade-up">
          <DashboardMockup />
        </div>
      </div>
    </section>
  )
}
