import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CaseBuyingModel, CaseOrganisation, CaseStrategy, LossReasonCode, ProjectStage } from '@bellum/contracts'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * Advance an opportunity's lifecycle, then refetch the list so every surface
 * (Besoins detail, future graph views) reflects the new state. Invalidation over
 * optimistic write — the mutation is rare and the list is small.
 */
export function useUpdateProjectStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      stage,
      lossReason,
      lossReasonCode,
      acceptedActions,
      caseDimensions,
    }: {
      id: string
      stage: ProjectStage
      lossReason?: string | null
      /** #3989.9 (Louis 15/10/2026) — le motif dans la liste FERMÉE commune. */
      lossReasonCode?: LossReasonCode | null
      /** Ce que l'utilisateur a coché dans le panneau d'effets. */
      acceptedActions?: readonly string[]
      /** #3246 (lot W9 + lot cloud 14/10) — stratégie / modèle d'achat / organisation saisis à la perte (vocabulaires fermés). */
      caseDimensions?: {
        strategy?: CaseStrategy | null
        buying_model?: CaseBuyingModel | null
        organisation?: CaseOrganisation | null
      }
    }) =>
      caseDimensions || lossReasonCode
        ? projectsApi.updateStage(id, stage, lossReason ?? null, acceptedActions ?? [], {
            ...caseDimensions,
            ...(lossReasonCode ? { loss_reason_code: lossReasonCode } : {}),
          })
        : projectsApi.updateStage(id, stage, lossReason ?? null, acceptedActions ?? []),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
      // #2446.17 — le dossier (`projectQueryKeys.byId`) et le pipe (`list`) vivent
      // sous `['opportunities']`, pas `['projects']` : sans cette ligne, l'étape et
      // l'action principale du dossier restaient périmées jusqu'au rechargement
      // (trouvé par le parcours e2e continu besoin → mission).
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })
}
