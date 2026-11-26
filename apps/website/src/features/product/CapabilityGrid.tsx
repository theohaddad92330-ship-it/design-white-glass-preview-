import { Card, Text } from '@bellum/ui'
import { Network, Table2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { FileTextIcon } from '@/components/ui/file-text'
import { MapPinIcon } from '@/components/ui/map-pin'
import { UserRoundCheckIcon } from '@/components/ui/user-round-check'
import { ZapIcon } from '@/components/ui/zap'
import { Kicker } from '@/features/landing/Kicker'

type AnimatedIcon = (props: { size?: number; className?: string }) => ReactNode

type Capability = {
  icon: AnimatedIcon
  /** Key into the `capabilities.items` messages record. */
  key: string
  /** CSS fallback animation for icons absent from lucide-animated. */
  cls?: string
}

const CAPABILITIES: Capability[] = [
  {
    icon: UserRoundCheckIcon,
    key: 'contacts',
  },
  {
    icon: ZapIcon,
    key: 'signals',
  },
  {
    icon: Table2,
    key: 'jobsTech',
    cls: 'ia-pop',
  },
  {
    icon: MapPinIcon,
    key: 'sites',
  },
  {
    icon: Network,
    key: 'similar',
    cls: 'ia-swing',
  },
  {
    icon: FileTextIcon,
    key: 'exportPdf',
  },
]

function CapabilityCard({ capability }: { capability: Capability }) {
  const t = useTranslations('product')
  const Icon = capability.icon
  return (
    <Card className="group rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:bg-[linear-gradient(180deg,rgba(123,97,255,0.12),rgba(255,255,255,0.03))]">
      <span className="inline-flex size-[50px] items-center justify-center rounded-[14px] border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.2),rgba(123,97,255,0.04))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
        <Icon size={22} className={capability.cls} />
      </span>
      <Text element="h3" size="lg" weight="bold" color="text-white" className="mt-4">
        {t(`capabilities.items.${capability.key}.title`)}
      </Text>
      <Text element="p" size="sm" color="text-zinc-500" className="mt-2 leading-relaxed">
        {t(`capabilities.items.${capability.key}.desc`)}
      </Text>
    </Card>
  )
}

export function CapabilityGrid() {
  const t = useTranslations('product')
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-xl animate-fade-up text-center">
          <Kicker center>{t('capabilities.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('capabilities.title')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(capability => (
            <CapabilityCard key={capability.key} capability={capability} />
          ))}
        </div>
      </div>
    </section>
  )
}
