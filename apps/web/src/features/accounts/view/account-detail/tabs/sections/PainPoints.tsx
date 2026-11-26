import type { PainPoint } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WhyNowItemList } from './WhyNowItemList'
import { createDetailRows, createUrgencyDetailRow } from './whyNowDetails'

type PainPointsProps = {
  pains: PainPoint[]
}

function hasPain(value: PainPoint): value is PainPoint & { pain: string } {
  return typeof value.pain === 'string' && value.pain.length > 0
}

export function PainPoints({ pains }: PainPointsProps) {
  const { t } = useTranslation('accountDetail')
  const renderable = pains.filter(hasPain)
  if (renderable.length === 0) return null
  const items = renderable.map((pain, index) => ({
    id: `${pain.pain}-${index}`,
    title: pain.pain,
    details: createDetailRows([
      { label: t('detail.issue'), value: pain.pain, icon: Target },
      { label: t('detail.businessImpact'), value: pain.business_impact },
      { label: t('detail.esnOffer'), value: pain.esn_offer },
      createUrgencyDetailRow(pain.urgency),
    ]),
  }))

  return (
    <section className="h-full p-5">
      <Text element="h3" size="sm" weight="semibold" className="mb-4 flex items-center gap-3">
        {t('whyNow.painsTitle')}
      </Text>
      <WhyNowItemList items={items} emptyLabel={t('whyNow.painsEmpty')} dotClassName="bg-[var(--bellum-success)]" />
    </section>
  )
}
