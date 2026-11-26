import { Card, Text } from '@bellum/ui'
import { ArrowRight, EyeOff, FileCheck2, Lock, MapPin, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

type ItemIcon = (props: { size?: number; className?: string }) => ReactNode
type ItemCopy = { title: string; desc: string }

const ICONS: ItemIcon[] = [MapPin, FileCheck2, Lock, ShieldCheck, EyeOff, SlidersHorizontal]

export function Security() {
  const t = useTranslations('home.security')
  const items = t.raw('items') as ItemCopy[]

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
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-lg leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const Icon = ICONS[i]!
            return (
              <Card
                key={item.title}
                className="group rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.2),rgba(123,97,255,0.04))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
                  <Icon size={20} />
                </span>
                <Text element="h3" size="lg" weight="bold" color="text-white" className="mt-4">
                  {item.title}
                </Text>
                <Text element="p" size="sm" color="text-zinc-400" className="mt-2 leading-relaxed">
                  {item.desc}
                </Text>
              </Card>
            )
          })}
        </div>

        <div className="mt-10 flex animate-fade-up flex-wrap items-center justify-center gap-6 text-center">
          <Link
            href="/privacy"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('linkPrivacy')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/dpa"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('linkDpa')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
