'use client'

import { Text, cn } from '@bellum/ui'
import { ArrowRight, CheckSquare, Network } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { FileTextIcon } from '@/components/ui/file-text'
import { SearchIcon } from '@/components/ui/search'
import { SparklesIcon } from '@/components/ui/sparkles'
import { ZapIcon } from '@/components/ui/zap'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

type AnimatedIcon = (props: { size?: number; className?: string }) => ReactNode

type AgentMeta = {
  icon: AnimatedIcon
  /** CSS fallback animation for icons absent from lucide-animated. */
  cls?: string
}

type AgentCopy = { title: string; sub: string }

const AGENTS: AgentMeta[] = [
  { icon: ZapIcon },
  { icon: SearchIcon },
  { icon: Network, cls: 'ia-swing' },
  { icon: CheckSquare, cls: 'ia-pop' },
  { icon: FileTextIcon },
]

const N = AGENTS.length
const xAt = (i: number) => ((i + 0.5) / N) * 100

export function Orchestration() {
  const t = useTranslations('home.orchestration')
  const agents = t.raw('agents') as AgentCopy[]
  const [active, setActive] = useState(0)
  const currentMeta = AGENTS[active]!
  const currentCopy = agents[active]!

  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="animate-fade-up">
          <Kicker>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.4vw,40px)] leading-tight"
          >
            {t('heading')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mt-4 leading-relaxed">
            {t('paragraph')}
          </Text>
          <Link
            href="/product"
            className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('cta')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="animate-sheen relative animate-fade-up overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(600px_360px_at_50%_0%,rgba(123,97,255,0.1),transparent_70%)] p-6 sm:p-8">
          <div className="mx-auto flex max-w-[320px] flex-col items-center">
            <div className="animate-glow flex items-center gap-2.5 rounded-xl border border-violet-500/45 bg-[rgba(16,16,28,0.9)] px-4 py-3 backdrop-blur">
              <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-violet-500/30 bg-violet-500/[0.16] text-violet-300">
                <SparklesIcon size={16} />
              </span>
              <div>
                <Text element="div" size="sm" weight="medium" color="text-white">
                  {t('rootTitle')}
                </Text>
                <Text element="div" size="xs" color="text-zinc-500">
                  {t('rootSub')}
                </Text>
              </div>
            </div>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="mt-1 block h-14 w-full">
            {AGENTS.map((_, i) => {
              const x = xAt(i)
              const on = i === active
              return (
                <path
                  key={i}
                  d={`M50,0 C50,52 ${x},48 ${x},100`}
                  fill="none"
                  stroke={on ? 'rgba(155,133,255,0.9)' : 'rgba(155,133,255,0.22)'}
                  strokeWidth={on ? 0.9 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  className={cn(on && 'animate-flow')}
                />
              )
            })}
          </svg>

          <div className="grid grid-cols-5 gap-2">
            {AGENTS.map((agent, i) => {
              const Icon = agent.icon
              const on = i === active
              return (
                <button
                  key={agents[i]!.title}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={on}
                  className={cn(
                    'group flex flex-col items-center gap-2 rounded-xl border p-2.5 text-center transition-colors',
                    on
                      ? 'border-violet-500/45 bg-violet-500/[0.12]'
                      : 'border-white/[0.12] bg-white/[0.02] hover:border-violet-500/35 hover:bg-white/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-9 items-center justify-center rounded-[9px] border transition-colors',
                      on
                        ? 'border-violet-500/40 bg-violet-500/[0.18] text-violet-200'
                        : 'border-violet-500/25 bg-violet-500/[0.1] text-violet-300',
                    )}
                  >
                    <Icon size={16} className={agent.cls} />
                  </span>
                  <span className={cn('text-xs font-medium leading-tight', on ? 'text-white' : 'text-zinc-400')}>
                    {agents[i]!.title}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/[0.14] text-violet-200">
              <currentMeta.icon size={15} className={currentMeta.cls} />
            </span>
            <Text element="p" size="sm" className="text-zinc-300">
              <b className="font-medium text-white">{currentCopy.title}</b> · {currentCopy.sub}
            </Text>
          </div>
        </div>
      </div>
    </section>
  )
}
