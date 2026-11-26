import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaveTeamReview } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { managerApi } from '../api'

/**
 * Enregistre le point d'équipe, puis relit le cockpit : les retards et les
 * affaires sans action datée viennent d'être traités, l'écran doit le dire.
 * Rien n'est patché en optimiste — le serveur peut refuser (compte d'ailleurs).
 */
export function useSaveTeamReview(onSaved: () => void) {
  const { t } = useTranslation('manager')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SaveTeamReview) => managerApi.saveTeamReview(body),
    onSuccess: result => {
      void qc.invalidateQueries({ queryKey: ['manager', 'team-stats'] })
      void qc.invalidateQueries({ queryKey: ['actions'] })
      toast.success(t('review.saved', { count: result.results.length }))
      onSaved()
    },
    onError: () => toast.error(t('review.failed')),
  })
}
