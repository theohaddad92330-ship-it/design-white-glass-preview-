import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { EntityResolution } from '@bellum/contracts'
import {
  useEntityResolutionCorrections,
  useRecordEntityResolutionCorrection,
} from '@/features/accounts/hooks/useEntityResolutionCorrections'
import { trackActionStarted } from '@/lib/product-tracker'
import { EntityResolutionCard } from './EntityResolutionCard'

// #2130.72 (épopée #3000) — le seul geste de CORRECTION du dossier compte qui
// écrit réellement quelque chose (à distinguer de `record_field_audit`,
// l'audit CRM par champ). Recopiée comme `ACCOUNT_DETAIL_SCREEN` l'est
// ailleurs (GA-26) : ce fichier reste le seul ÉCRIVAIN de ce geste.
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'
const CORRECTION_SUBMITTED_ACTION = 'correction_submitted'

/**
 * #2284.65 / .67-.69 — la carte « Entité résolue » branchée sur l'espace :
 * l'historique des corrections versionnées est LU puis superposé au calcul, et
 * le geste « c'est bien celle-ci » / « ce n'est pas celle-ci » en ÉCRIT une de
 * plus. Muette (aucune requête) sur un dossier antérieur à #2284.
 */
export function EntityResolutionPanel({
  accountId,
  resolution,
}: {
  accountId: string
  resolution: EntityResolution | null
}) {
  const { t } = useTranslation('accountDetail')
  const corrections = useEntityResolutionCorrections(resolution ? accountId : undefined)
  const record = useRecordEntityResolutionCorrection(accountId)
  if (!resolution) return null
  return (
    <EntityResolutionCard
      resolution={resolution}
      corrections={corrections.data ?? []}
      pending={record.isPending}
      onCorrect={request => {
        trackActionStarted(CORRECTION_SUBMITTED_ACTION, ACCOUNT_DETAIL_SCREEN)
        record.mutate(request, {
          onError: () => {
            toast.error(t('overview.entityResolution.correctionFailed'))
          },
        })
      }}
    />
  )
}
