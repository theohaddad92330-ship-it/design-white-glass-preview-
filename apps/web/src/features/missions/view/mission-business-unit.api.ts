import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { missionBusinessUnitTransferResultSchema, type MissionBusinessUnitTransferResult } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * #3413 « autre BU » — la BU propriétaire d'une mission et son TRANSFERT.
 * Même lieu que `mission-panel.api.ts` : une route à soi pour un contenu à soi,
 * jamais une seconde lecture des quatre routes que `MissionDetailTabs` interroge.
 */
type MissionBusinessUnitState = {
  /** `null` = aucune BU propriétaire (ni la sienne, ni celle de son compte). */
  businessUnit: { id: string; name: string } | null
  /** `true` = la mission SUIT la BU de son compte, aucun transfert n'a eu lieu. */
  inherited: boolean
}

const key = (missionId: string) => ['missions', 'business-unit', missionId] as const

export function useMissionBusinessUnit(missionId: string) {
  return useQuery({
    queryKey: key(missionId),
    queryFn: () => apiFetch<MissionBusinessUnitState>({ path: `/delivery/missions/${missionId}/business-unit` }),
    staleTime: 30_000,
  })
}

/** Le geste de transfert : explicite, confirmé (`confirm: true` posé ICI, jamais
 *  par l'appelant — la case de confirmation de l'écran précède l'appel). */
export function useTransferMissionBusinessUnit(missionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (targetBusinessUnitId: string): Promise<MissionBusinessUnitTransferResult> =>
      missionBusinessUnitTransferResultSchema.parse(
        await apiFetch<unknown>({
          path: `/delivery/missions/${missionId}/business-unit/transfer`,
          method: 'POST',
          body: { targetBusinessUnitId, confirm: true },
        }),
      ),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: key(missionId) })
      // Le transfert est journalisé : « Historique » de la fiche le relit.
      void queryClient.invalidateQueries({ queryKey: ['crm', 'history', 'mission', missionId] })
      toast.success(i18n.t('missions:businessUnit.transferred', { name: result.to.name }))
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t('missions:businessUnit.transferFailed'))
    },
  })
}
