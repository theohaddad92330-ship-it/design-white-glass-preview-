import { Card, Text } from '@bellum/ui'
import { ListChecks } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { ClockIcon } from '@/components/ui/clock'
import { GaugeIcon } from '@/components/ui/gauge'
import { MapPinIcon } from '@/components/ui/map-pin'
import { ShieldCheckIcon } from '@/components/ui/shield-check'

type AnimatedIcon = (props: { size?: number; className?: string }) => ReactNode

type Principle = {
  icon: AnimatedIcon
  /** CSS fallback animation for icons absent from lucide-animated. */
  cls?: string
}

/** Icons/animations stay in the component; labels come from the `about` namespace, zipped by index. */
const PRINCIPLES: Principle[] = [
  { icon: MapPinIcon },
  { icon: ListChecks, cls: 'ia-pop' },
  { icon: GaugeIcon },
  { icon: ClockIcon },
  { icon: ShieldCheckIcon },
]

export function Principles() {
  const t = useTranslations('about')
  const labels = t.raw('principles.labels') as string[]
  return (
    <section className="py-24">
      <div className="mx-auto flex items-center flex-col max-w-7xl px-6">
        <div className="mx-auto mb-10 grid max-w-5xl grid-cols-[auto_1fr] items-center gap-5 sm:gap-7">
          <span className="text-5xl font-bold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(139,92,246,0.5)]">
            03
          </span>
          <Text element="h2" weight="medium" color="text-white" className="text-[clamp(24px,3vw,38px)] leading-tight">
            {t('principles.title')}
          </Text>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PRINCIPLES.map((principle, i) => {
            const Icon = principle.icon
            const label = labels[i]
            return (
              <Card
                key={label}
                className="group rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:bg-[linear-gradient(180deg,rgba(123,97,255,0.12),rgba(255,255,255,0.03))]"
              >
                <span className="mb-4 inline-flex size-[38px] items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/[0.14] text-violet-300 transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_10px_26px_-12px_rgba(123,97,255,0.55)]">
                  <Icon size={18} className={principle.cls} />
                </span>
                <Text element="p" size="sm" weight="medium" color="text-white">
                  {label}
                </Text>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
