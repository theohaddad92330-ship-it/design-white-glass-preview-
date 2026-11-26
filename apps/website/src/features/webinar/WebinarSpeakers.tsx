import { Card, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

type SpeakerCopy = { role: string }

// Names and initials are proper nouns — they stay identical in both locales.
const SPEAKERS = [
  { initials: 'L', name: 'Louis' },
  { initials: 'T', name: 'Théo' },
] as const

export function WebinarSpeakers() {
  const t = useTranslations('webinar.speakers')
  const items = t.raw('items') as SpeakerCopy[]

  return (
    <section className="py-16">
      <div className="mx-auto max-w-[900px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(26px,3.4vw,40px)] leading-tight"
          >
            {t('title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-lg leading-relaxed">
            {t('subtitle')}
          </Text>
        </div>

        <div className="mx-auto mt-10 grid max-w-2xl animate-fade-up gap-4 sm:grid-cols-2">
          {SPEAKERS.map((speaker, i) => (
            <Card
              key={speaker.name}
              className="flex items-center gap-4 rounded-2xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6 backdrop-blur-[16px]"
            >
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-full border border-violet-500/30 bg-[linear-gradient(160deg,rgba(123,97,255,0.28),rgba(123,97,255,0.06))] text-lg font-semibold text-white"
              >
                {speaker.initials}
              </span>
              <div>
                <Text element="div" size="lg" weight="medium" color="text-white">
                  {speaker.name}
                </Text>
                <Text element="p" size="sm" color="text-zinc-400" className="mt-0.5 leading-relaxed">
                  {items[i]?.role}
                </Text>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
