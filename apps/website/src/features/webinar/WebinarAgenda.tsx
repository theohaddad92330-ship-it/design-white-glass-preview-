import { Card, Text } from '@bellum/ui'
import { Gift, ListChecks, MessageSquare, Radar, Search, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

type SegmentCopy = { duration: string; title: string; desc: string }

// Ordered to match the `segments` array in the `webinar` message catalog
// (problème, démo, cas d'usage, Q/R, offre).
const AGENDA_ICONS: LucideIcon[] = [Search, Radar, ListChecks, MessageSquare, Gift]

export function WebinarAgenda() {
  const t = useTranslations('webinar.agenda')
  const segments = t.raw('segments') as SegmentCopy[]

  return (
    <section id="programme" className="scroll-mt-24 py-24">
      <div className="mx-auto max-w-[900px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
            {t('subtitle')}
          </Text>
        </div>

        <div className="mt-12 flex animate-fade-up flex-col gap-3">
          {segments.map((segment, i) => {
            const Icon = AGENDA_ICONS[i] ?? Search
            return (
              <Card
                key={segment.title}
                className="flex items-start gap-4 rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 backdrop-blur-[16px] transition-colors hover:border-violet-500/40 sm:gap-5 sm:p-6"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.22),rgba(123,97,255,0.05))] text-violet-200">
                  <Icon size={20} />
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Text element="h3" size="lg" weight="medium" color="text-white">
                      {segment.title}
                    </Text>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-violet-200">
                      {segment.duration}
                    </span>
                  </div>
                  <Text element="p" size="sm" color="text-zinc-400" className="mt-1.5 leading-relaxed">
                    {segment.desc}
                  </Text>
                </div>
              </Card>
            )
          })}
        </div>

        <Text className="mt-6 text-center text-sm text-zinc-500">{t('note')}</Text>
      </div>
    </section>
  )
}
