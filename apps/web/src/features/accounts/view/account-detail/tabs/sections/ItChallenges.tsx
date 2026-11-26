import type { ItChallenge } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { FileText, Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WhyNowItemList } from './WhyNowItemList'
import { createDetailRows, createSeverityDetailRow, createTimeframeDetailRow } from './whyNowDetails'

type ItChallengesProps = {
  challenges: ItChallenge[]
}

function hasTitle(value: ItChallenge): value is ItChallenge & { title: string } {
  return typeof value.title === 'string' && value.title.length > 0
}

export function ItChallenges({ challenges }: ItChallengesProps) {
  const { t } = useTranslation('accountDetail')
  const renderable = challenges.filter(hasTitle)
  const items = renderable.map((challenge, index) => ({
    id: `${challenge.title}-${index}`,
    title: challenge.title,
    details: createDetailRows([
      { label: t('detail.issue'), value: challenge.title, icon: Target },
      { label: t('detail.description'), value: challenge.description, icon: FileText },
      createSeverityDetailRow(challenge.severity),
      createTimeframeDetailRow(challenge.timeframe),
    ]),
  }))

  return (
    <section className="h-full border-t border-[var(--bellum-border)] p-5 md:border-t-0">
      <Text element="h3" size="sm" weight="semibold" className="mb-4 flex items-center gap-3">
        {t('whyNow.challengesTitle')}
      </Text>
      <WhyNowItemList
        items={items}
        emptyLabel={t('whyNow.challengesEmpty')}
        dotClassName="bg-[var(--bellum-primary-500)]"
      />
    </section>
  )
}
