import { Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

type CreditRow = {
  action: string
  cost: string
  rule: string
}

// Row copy (action / cost / rule) lives in `messages/<locale>/pricing.json`
// under `credits.rows`; only the `accent` flag stays here, zipped by index.
const ACCENT: readonly boolean[] = [true, false, false, false, true]

const COLS = 'sm:grid-cols-[1.4fr_1fr_2fr]'

export function Credits() {
  const t = useTranslations('pricing')
  const rows = t.raw('credits.rows') as CreditRow[]
  const headers = t.raw('credits.headers') as string[]

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[920px] px-6">
        <div className="mx-auto max-w-xl animate-fade-up text-center">
          <Kicker center>{t('credits.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('credits.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-lg leading-relaxed">
            {t('credits.subtitle')}
          </Text>
        </div>

        <div className="mt-10 animate-fade-up overflow-hidden rounded-2xl border border-white/10">
          <div className={cn('hidden gap-4 bg-white/[0.02] px-5 py-3 sm:grid', COLS)}>
            {headers.map(head => (
              <Text key={head} element="span" size="xs" className="uppercase tracking-[0.1em] text-[#8a8aa0]">
                {head}
              </Text>
            ))}
          </div>

          {rows.map((row, index) => (
            <div
              key={row.action}
              className={cn('grid grid-cols-1 gap-1 border-t border-white/10 px-5 py-4 sm:items-center sm:gap-4', COLS)}
            >
              <Text element="span" size="sm" weight="medium" color="text-white">
                {row.action}
              </Text>
              <Text
                element="span"
                size="sm"
                className={cn('font-mono', ACCENT[index] ? 'text-violet-300' : 'text-zinc-300')}
              >
                {row.cost}
              </Text>
              <Text element="span" size="sm" color="text-zinc-500">
                {row.rule}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
