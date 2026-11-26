import { Card, Text } from '@bellum/ui'
import { Lightbulb, Radar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WatchInsight, WatchScenario } from '@/features/accounts/model/watch'

export function WatchInsightsPanel({ insights, scenario }: { insights: WatchInsight[]; scenario: WatchScenario }) {
  const { t } = useTranslation('accountWatch')
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-4 text-[var(--bellum-text-accent)]" />
        <Text element="h2" size="sm" weight="semibold">
          {t('insights.title')}
        </Text>
      </div>
      {insights.length > 0 ? <InsightList insights={insights} /> : <InsightEmptyState scenario={scenario} />}
    </Card>
  )
}

function InsightList({ insights }: { insights: WatchInsight[] }) {
  return (
    <ol className="mt-5 space-y-5">
      {insights.map((insight, index) => (
        <li key={insight.title} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold">
            {index + 1}
          </span>
          <div className="min-w-0">
            <Text size="sm" weight="semibold">
              {insight.title}
            </Text>
            <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
              {insight.detail}
            </Text>
          </div>
        </li>
      ))}
    </ol>
  )
}

function InsightEmptyState({ scenario }: { scenario: WatchScenario }) {
  const { t } = useTranslation('accountWatch')
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
      <Radar className="size-5 text-[var(--bellum-text-muted)]" />
      <Text size="xs" className="mt-3 max-w-52 text-[var(--bellum-text-secondary)]">
        {scenario === 'empty' ? t('insights.emptyNoSignals') : t('insights.emptyInsufficient')}
      </Text>
    </div>
  )
}
