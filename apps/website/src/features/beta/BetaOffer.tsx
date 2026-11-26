import { Card, Text, cn } from '@bellum/ui'
import { Check, MessageSquare, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PRIMARY_BUTTON } from '@/lib/button-styles'
import { Kicker } from '@/features/landing/Kicker'

export function BetaOffer() {
  const t = useTranslations('beta')
  const included = t.raw('offer.included') as string[]
  const expected = t.raw('offer.expected') as string[]
  const notIncluded = t.raw('offer.notIncluded') as string[]

  return (
    <section id="offre" className="scroll-mt-24 py-16">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('offer.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('offer.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
            {t('offer.subtitle')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Price + included */}
          <Card className="flex flex-col gap-6 rounded-3xl border-violet-500/45 bg-[linear-gradient(180deg,rgba(123,97,255,0.1),rgba(123,97,255,0.02))] p-8 shadow-[0_30px_70px_-30px_rgba(123,97,255,0.5)]">
            <div>
              <Text element="div" size="lg" weight="medium" color="text-zinc-200">
                {t('offer.planName')}
              </Text>
              <div className="mt-3 flex items-baseline gap-1.5">
                <Text element="span" weight="bold" color="text-white" className="text-[clamp(38px,5vw,52px)]">
                  {t('offer.price')}
                </Text>
                <Text element="span" size="sm" color="text-zinc-500">
                  {t('offer.per')}
                </Text>
              </div>
              <Text element="p" size="sm" color="text-zinc-500" className="mt-2">
                {t('offer.note')}
              </Text>
            </div>

            <a href="#candidature" className={cn(PRIMARY_BUTTON, 'w-full')}>
              {t('offer.cta')}
            </a>

            <ul className="space-y-3">
              {included.map(item => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                  <Text element="span" size="sm" color="text-zinc-300" className="font-sans leading-relaxed">
                    {item}
                  </Text>
                </li>
              ))}
            </ul>
          </Card>

          {/* Expectations + not included */}
          <div className="flex flex-col gap-4">
            <Card className="rounded-3xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-7 backdrop-blur-[16px]">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg border border-violet-500/25 bg-violet-500/[0.12] text-violet-300">
                  <MessageSquare size={16} />
                </span>
                <Text element="h3" weight="medium" color="text-white" className="text-base">
                  {t('offer.expectedTitle')}
                </Text>
              </div>
              <ul className="mt-4 space-y-3">
                {expected.map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check size={17} className="mt-0.5 shrink-0 text-violet-300" />
                    <Text element="span" size="sm" color="text-zinc-300" className="font-sans leading-relaxed">
                      {item}
                    </Text>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="rounded-3xl border-white/[0.1] bg-white/[0.015] p-7">
              <Text element="h3" weight="medium" color="text-zinc-300" className="text-base">
                {t('offer.notIncludedTitle')}
              </Text>
              <ul className="mt-4 space-y-3">
                {notIncluded.map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <X size={17} className="mt-0.5 shrink-0 text-zinc-500" />
                    <Text element="span" size="sm" color="text-zinc-400" className="font-sans leading-relaxed">
                      {item}
                    </Text>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
