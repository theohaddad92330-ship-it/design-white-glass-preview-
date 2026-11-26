import { Card, Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Kicker } from '@/features/landing/Kicker'
import { Reveal } from '@/features/landing/Reveal'
import { MessageCompose } from './MessageCompose'
import { SignalPulse } from './SignalPulse'

type SpotlightProps = {
  kicker: string
  title: string
  desc: string
  visual: ReactNode
  reversed?: boolean
}

function Spotlight({ kicker, title, desc, visual, reversed }: SpotlightProps) {
  return (
    <Reveal>
      <section className="py-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <div className={cn(reversed && 'lg:order-2')}>
            <Kicker>{kicker}</Kicker>
            <Text
              element="h2"
              weight="medium"
              color="text-white"
              className="mt-4 text-[clamp(26px,3.2vw,38px)] leading-tight"
            >
              {title}
            </Text>
            <Text element="p" size="lg" color="text-zinc-400" className="mt-4 leading-relaxed">
              {desc}
            </Text>
          </div>
          <div className={cn(reversed && 'lg:order-1')}>{visual}</div>
        </div>
      </section>
    </Reveal>
  )
}

function SynthesisVisual() {
  const t = useTranslations('product')
  return (
    <Card className="relative overflow-hidden rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-[80%] w-3/5 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.3),transparent_70%)] blur-[70px]" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Text element="span" size="xs" className=" uppercase tracking-[0.08em] text-[#8a8aa0]">
            {t('synthesis.label')}
          </Text>
          <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
            {t('synthesis.badge')}
          </span>
        </div>
        <SignalPulse />
      </div>
    </Card>
  )
}

export function AnalysisSpotlight() {
  const t = useTranslations('product')
  return (
    <Spotlight
      kicker={t('analysis.kicker')}
      title={t('analysis.title')}
      desc={t('analysis.desc')}
      visual={<SynthesisVisual />}
    />
  )
}

export function MessagesSpotlight() {
  const t = useTranslations('product')
  return (
    <Spotlight
      kicker={t('messages.kicker')}
      title={t('messages.title')}
      desc={t('messages.desc')}
      visual={<MessageCompose />}
    />
  )
}
