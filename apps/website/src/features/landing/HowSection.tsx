import { Card, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'
import { AutoIcon } from '@/components/icons/AutoIcon'
import { SearchIcon } from '@/components/ui/search'
import { SendIcon } from '@/components/ui/send'
import { UsersIcon } from '@/components/ui/users'
import { Kicker } from './Kicker'

type AnimatedIcon = ComponentProps<typeof AutoIcon>['icon']

type StepMeta = { num: string; icon: AnimatedIcon }
type StepCopy = { title: string; desc: string }

const STEPS: StepMeta[] = [
  { num: '01', icon: SearchIcon },
  { num: '02', icon: UsersIcon },
  { num: '03', icon: SendIcon },
]

function StepCard({
  meta,
  copy,
  stepLabel,
  index,
}: {
  meta: StepMeta
  copy: StepCopy
  stepLabel: string
  index: number
}) {
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40">
      <span className="pointer-events-none absolute -top-2 right-3 text-7xl font-bold leading-none text-white/[0.04] [font-family:'Clash_Display',sans-serif]">
        {meta.num}
      </span>
      <Text element="div" size="sm" className="uppercase text-violet-300">
        {stepLabel} {meta.num}
      </Text>
      <div className="mt-4 inline-flex size-12 items-center justify-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.22),rgba(123,97,255,0.05))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
        <AutoIcon icon={meta.icon} size={22} delay={index * 700} />
      </div>
      <Text element="h3" size="xl" weight="bold" color="text-white" className="mt-4">
        {copy.title}
      </Text>
      <Text element="p" size="sm" color="text-zinc-400" className="mt-2 leading-relaxed">
        {copy.desc}
      </Text>
    </Card>
  )
}

export function HowSection() {
  const t = useTranslations('home.how')
  const steps = t.raw('steps') as StepCopy[]
  const stepLabel = t('stepLabel')

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('headingPrefix')}
            <span className="text-gradient-em">{t('headingEm')}</span>
            {t('headingSuffix')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 md:grid-cols-3">
          {STEPS.map((meta, i) => (
            <StepCard key={meta.num} meta={meta} copy={steps[i]!} stepLabel={stepLabel} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
