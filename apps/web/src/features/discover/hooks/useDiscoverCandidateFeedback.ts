import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { DiscoverCandidateFeedbackResponse } from '@bellum/contracts'
import { discoverApi } from '@/features/discover/api/discover-api'

/**
 * #3671.2bis — « Mauvaise entreprise » : signale au serveur que ce candidat
 * ne doit plus être rattaché aux recherches suivantes de cet espace. Idempotent
 * côté serveur (`ON CONFLICT DO NOTHING`) — un second clic ne fait rien de plus.
 */
export function useReportWrongCompany(siren: string) {
  const { t } = useTranslation('discover')
  return useMutation<DiscoverCandidateFeedbackResponse, Error, void>({
    mutationFn: () => discoverApi.feedback.reportWrongCompany(siren),
    onSuccess: () => toast.success(t('card.wrongCompany.reported')),
    onError: () => toast.error(t('card.wrongCompany.reportError')),
  })
}
