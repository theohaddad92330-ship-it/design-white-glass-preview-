import { Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'

type OpportunityBannerProps = {
  completedCount: number
  opportunityCount: number
  onView: () => void
}

export const OpportunityBanner = ({ completedCount, opportunityCount, onView }: OpportunityBannerProps) => {
  const { t } = useTranslation('accounts')
  // #1846 — le POSITIONNEMENT de la carte (marge, alignée sur la gouttière de
  // page) est le token partagé ; son PADDING interne (px-4 md:px-6 py-3) reste
  // propre à la carte, une valeur de card, pas une gouttière de page.
  return (
    <Card
      className={`${PAGE_GUTTER_MX} mb-2 shrink-0 flex flex-row items-center justify-between gap-4 px-4 md:px-6 py-3`}
    >
      <div className="flex flex-col gap-0.5">
        <Text size="sm" weight="semibold">
          {t('opportunityBanner.title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)] mt-0.5">
          {t('opportunityBanner.analyzed', { count: completedCount })},{' '}
          {t('opportunityBanner.highPotential', { count: opportunityCount })}
        </Text>
      </div>
      <Button variant="black" size="sm" onClick={onView} className="shrink-0">
        {t('opportunityBanner.cta')}
      </Button>
    </Card>
  )
}
