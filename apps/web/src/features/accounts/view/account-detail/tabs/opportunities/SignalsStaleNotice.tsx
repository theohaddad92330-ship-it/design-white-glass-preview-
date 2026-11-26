import { REFRESH_DIMENSION_CREDIT_COST } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { SegmentStaleCollectionNotice } from '../../components/SegmentStaleCollectionNotice'

/**
 * #4047.1 (retour bêta 12/10) — « il faut le bouton actualiser directement dans ce bloc
 * d'information ». L'avis de collecte antérieure des signaux porte désormais l'action
 * d'actualisation EXISTANTE de ce segment (`useRefreshDimension` → `signals`, la même que le menu
 * « ··· »), sans nouveau chemin de coût : le crédit débité est annoncé sur le bouton lui-même
 * (garde « credited-actions-announce-their-cost »), et le clic est le SEUL déclencheur.
 */
export function SignalsStaleNotice({ accountId, collectedAt }: { accountId: string; collectedAt: string | null }) {
  const { t } = useTranslation('projects')
  const refresh = useRefreshDimension(accountId)
  return (
    <SegmentStaleCollectionNotice
      dimension="signals"
      collectedAt={collectedAt}
      action={{
        label: t('accountOpportunity.refreshSignals'),
        onClick: () => refresh.mutate('signals'),
        pending: refresh.isPending,
      }}
    />
  )
}
