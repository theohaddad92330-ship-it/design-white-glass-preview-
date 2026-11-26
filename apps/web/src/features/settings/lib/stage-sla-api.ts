import type { PipelineStage } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Une étape du pipe, sa durée cible en vigueur, et d'où elle vient. */
export type StageSlaRow = { stage: PipelineStage; slaDays: number | null; isDefault: boolean }

/**
 * Le SLA d'étape du pipe (PDF 3 §3.5) côté client.
 *
 * `slaDays: null` en écriture REMET le défaut du produit — c'est le seul geste
 * de retour arrière, et il ne passe pas par la base.
 */
export const stageSlaApi = {
  /**
   * #2170.43 — `canEdit` : l'appelant peut-il régler (propriétaire ou
   * administrateur) ? Optionnel pour le deploy-skew : une API antérieure ne le
   * dit pas, et l'écran ne verrouille alors rien (l'API refuse elle-même).
   */
  list(): Promise<{ items: StageSlaRow[]; canEdit?: boolean }> {
    return apiFetch<{ items: StageSlaRow[]; canEdit?: boolean }>({ path: '/pipeline/stage-sla' })
  },

  set(stage: PipelineStage, slaDays: number | null): Promise<{ items: StageSlaRow[] }> {
    return apiFetch<{ items: StageSlaRow[] }, { slaDays: number | null }>({
      path: `/pipeline/stage-sla/${stage}`,
      method: 'PUT',
      body: { slaDays },
    })
  },
}
