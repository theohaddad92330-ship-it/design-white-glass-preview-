import type { RecentSignal } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { ArrowRight, Radio, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type MainSignalCardProps = {
  signals: RecentSignal[]
  onViewSignals: () => void
}

export function MainSignalCard({ signals, onViewSignals }: MainSignalCardProps) {
  const { t } = useTranslation('accountDetail')
  const first = signals[0] ?? null
  const signalCount = signals.length

  return (
    <section className="flex min-w-0 flex-col p-4">
      <div className="mb-8 flex items-center gap-2">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('mainSignal.title')}
        </Text>
        {signalCount > 1 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--bellum-bg-lighter)] dark:bg-[var(--bellum-surface-2)] text-xs px-2 py-0.5 font-medium text-[var(--bellum-text-secondary)]">
            <TrendingUp className="size-3" />
            {t('mainSignal.count', { count: signalCount })}
          </span>
        ) : null}
      </div>

      {first ? (
        <Text
          element="p"
          size="base"
          weight="semibold"
          className="line-clamp-3 leading-snug text-[var(--bellum-text-primary)]"
        >
          {first.signal}
        </Text>
      ) : (
        <div className="max-w-sm space-y-2">
          <Text element="p" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('mainSignal.emptyTitle')}
          </Text>
          <Text element="p" size="sm" className="line-clamp-3 text-[var(--bellum-text-secondary)]">
            {t('mainSignal.emptyDescription')}
          </Text>
        </div>
      )}

      <Button
        type="button"
        onClick={onViewSignals}
        icon={ArrowRight}
        iconPosition="right"
        variant="ghost"
        size="sm"
        className="mt-auto w-fit px-0"
      >
        {t('mainSignal.cta')}
      </Button>
    </section>
  )
}
