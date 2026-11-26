import type { OfferProposal } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { OfferRecommendationsCard } from './OfferRecommendationsCard'

type OffersAndPositioningSectionProps = {
  offers: OfferProposal[]
}

export function OffersAndPositioningSection({ offers }: OffersAndPositioningSectionProps) {
  const { t } = useTranslation('accountDetail')
  if (offers.length === 0) return null

  return (
    <section className="space-y-4 py-2">
      <Text element="h2" size="base" weight="semibold">
        {t('offers.sectionTitle')}
      </Text>
      <OfferRecommendationsCard offers={offers} />
    </section>
  )
}
