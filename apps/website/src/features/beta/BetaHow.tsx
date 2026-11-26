import { Card, Text } from '@bellum/ui'
import { Building2, FileText, Radar, Send, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

type Step = {
  num: string
  icon: LucideIcon
}

/** Number + icon stay in the component; title/desc come from the `beta` namespace, zipped by index. */
const STEPS: Step[] = [
  { num: '01', icon: Building2 },
  { num: '02', icon: Radar },
  { num: '03', icon: FileText },
  { num: '04', icon: Send },
]

function StepCard({ step, stepLabel, title, desc }: { step: Step; stepLabel: string; title: string; desc: string }) {
  const Icon = step.icon
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40">
      <span className="pointer-events-none absolute -top-2 right-3 text-7xl font-bold leading-none text-white/[0.04] [font-family:'Clash_Display',sans-serif]">
        {step.num}
      </span>
      <Text element="div" size="sm" className="uppercase text-violet-300">
        {stepLabel} {step.num}
      </Text>
      <div className="mt-4 inline-flex size-12 items-center justify-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.22),rgba(123,97,255,0.05))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
        <Icon size={22} />
      </div>
      <Text element="h3" size="xl" weight="bold" color="text-white" className="mt-4">
        {title}
      </Text>
      <Text element="p" size="sm" color="text-zinc-400" className="mt-2 leading-relaxed">
        {desc}
      </Text>
    </Card>
  )
}

export function BetaHow() {
  const t = useTranslations('beta')
  const steps = t.raw('how.steps') as { title: string; desc: string }[]
  const stepLabel = t('how.stepLabel')

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('how.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('how.titlePrefix')}
            <span className="text-gradient-em">{t('how.titleHighlight')}</span>
            {t('how.titleSuffix')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <StepCard
              key={step.num}
              step={step}
              stepLabel={stepLabel}
              title={steps[i]?.title ?? ''}
              desc={steps[i]?.desc ?? ''}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
