import { Card, Text, cn } from '@bellum/ui'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PRIMARY_BUTTON } from '@/lib/button-styles'
import { Kicker } from '@/features/landing/Kicker'

export function WebinarReplay() {
  const t = useTranslations('webinar.replay')

  return (
    <section className="py-16">
      <div className="mx-auto max-w-[900px] px-6">
        <Card className="relative overflow-hidden rounded-3xl border-violet-500/40 bg-[linear-gradient(180deg,rgba(123,97,255,0.1),rgba(123,97,255,0.02))] p-8 text-center shadow-[0_30px_70px_-30px_rgba(123,97,255,0.5)] sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_-20%,rgba(124,58,237,0.25),transparent_70%)]" />

          <div className="relative z-10 mx-auto max-w-xl animate-fade-up">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-violet-500/30 bg-[linear-gradient(160deg,rgba(123,97,255,0.28),rgba(123,97,255,0.06))] text-violet-100">
              <PlayCircle size={24} />
            </span>

            <div className="mt-5">
              <Kicker center>{t('kicker')}</Kicker>
            </div>

            <Text
              element="h2"
              weight="medium"
              color="text-white"
              className="mt-4 text-[clamp(24px,3.2vw,36px)] leading-tight"
            >
              {t('title')}
            </Text>
            <Text element="p" size="lg" color="text-zinc-300" className="mx-auto mt-4 max-w-lg leading-relaxed">
              {t('desc')}
            </Text>

            <div className="mt-8 flex justify-center">
              <a href="#inscription" className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}>
                {t('cta')}
                <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
