import { Card, Text } from '@bellum/ui'
import { ArrowRight, Briefcase, Code2, Network } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { ActivityIcon } from '@/components/ui/activity'
import { BoxesIcon } from '@/components/ui/boxes'
import { UsersIcon } from '@/components/ui/users'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

type AnimatedIcon = (props: { size?: number; className?: string }) => ReactNode

type FeatureMeta = {
  icon: AnimatedIcon
  /** CSS fallback animation for icons absent from lucide-animated. */
  cls?: string
}

type FeatureCopy = { title: string; desc: string }

const FEATURES: FeatureMeta[] = [
  { icon: ActivityIcon },
  { icon: UsersIcon },
  { icon: Network, cls: 'ia-swing' },
  { icon: Briefcase, cls: 'ia-pop' },
  { icon: Code2, cls: 'ia-wiggle' },
  { icon: BoxesIcon },
]

function FeatureCard({ meta, copy }: { meta: FeatureMeta; copy: FeatureCopy }) {
  const Icon = meta.icon
  return (
    <Card className="group rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:bg-[linear-gradient(180deg,rgba(123,97,255,0.12),rgba(255,255,255,0.03))]">
      <span className="inline-flex size-[50px] items-center justify-center rounded-[14px] border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.2),rgba(123,97,255,0.04))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
        <Icon size={22} className={meta.cls} />
      </span>
      <Text element="h3" size="lg" weight="bold" color="text-white" className="mt-4">
        {copy.title}
      </Text>
      <Text element="p" size="sm" color="text-zinc-500" className="mt-2 leading-relaxed">
        {copy.desc}
      </Text>
    </Card>
  )
}

export function FeaturesSection() {
  const t = useTranslations('home.features')
  const features = t.raw('items') as FeatureCopy[]

  return (
    <section className="relative overflow-hidden py-24">
      <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 select-none text-[clamp(120px,21vw,300px)] font-bold leading-none text-white/[0.025]">
        {t('watermark')}
      </span>

      <div className="relative mx-auto max-w-[1200px] px-6 pt-10">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('heading')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-md leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((meta, i) => (
            <FeatureCard key={features[i]!.title} meta={meta} copy={features[i]!} />
          ))}
        </div>

        <div className="mt-10 animate-fade-up text-center">
          <Link
            href="/product"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('cta')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
