import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { NeedStoredStatus, NeedUrgency, ProjectNeed, UpdateProjectNeed } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { matchingApi } from '@/features/matching/api'
import { apiFetch } from '@/lib/api'
import { needStepsApi, openNeedsKeys } from '../api'
import {
  needActionTargetStatus,
  runNeedBulk,
  summariseNeedBulk,
  type NeedBulkOutcome,
  type NeedReasonAction,
} from '../model/need-actions'

/** Ce qu'un geste demande. Un seul type pour les sept : la barre de sélection
 *  et le menu d'une ligne appellent exactement la même chose, à la taille de la
 *  sélection près. */
export type NeedActionInput =
  | { kind: 'assign_owner'; needIds: readonly string[]; ownerId: string | null }
  | { kind: 'set_urgency'; needIds: readonly string[]; urgency: NeedUrgency | null }
  /** #2173.48 — un seul libellé, posé comme une nouvelle « prochaine étape »
   *  (`needStepsApi.create`, déjà existant sur la fiche d'UN besoin) sur
   *  chacun des besoins cochés. Le copilote PRÉPARE l'action, il ne l'exécute
   *  jamais à la place du commercial — voir `need-actions.ts`. */
  | { kind: 'create_actions'; needIds: readonly string[]; label: string }
  /** Les trois gestes qui EXIGENT leur motif : le serveur rend 400 sans lui
   *  (`needStatusRequiresReason`), et l'écran n'ouvre pas le bouton tant que le
   *  champ est vide. La veille et les DEUX clôtures — jamais fusionnées. */
  | { kind: NeedReasonAction; needIds: readonly string[]; reason: string; resumeOn?: string | null }
  /** Les deux qui ne demandent rien de plus. `reactivate` EFFACE le motif côté
   *  serveur ; le lui envoyer à `null` est ce que l'écran a de plus proche d'un
   *  accord explicite avec lui. */
  | { kind: 'match' | 'reactivate'; needIds: readonly string[] }
  /**
   * #2173.49 — ARCHIVER : un rangement NEUTRE, jamais un statut (décision
   * Louis 17/09/2026). Deux portes DÉDIÉES (`POST .../archive`,
   * `POST .../unarchive`), séparées du patch générique ET de la porte
   * d'état, exactement pour qu'aucun des deux ne puisse jamais toucher
   * `status`. `unarchive`, et non `reactivate` : ce dernier désigne déjà un
   * AUTRE geste sur un besoin (`to_reactivate`).
   */
  | { kind: 'archive' | 'unarchive'; needIds: readonly string[] }

/**
 * Les sept gestes sur les besoins — à l'unité comme sur une sélection.
 *
 * ⚠️ Chacun rejoue l'appel UNITAIRE qui existe déjà — `PATCH /projects/needs/:id`
 * pour l'urgence et le propriétaire, `PATCH /projects/needs/:id/status` pour la
 * veille, la reprise et les deux clôtures, `POST /needs/:id/match` pour le
 * rapprochement. Aucune route de masse : les vérifications du serveur (transition
 * permise, motif obligatoire, propriétaire membre de l'espace) restent celles du
 * geste à l'unité, et ne peuvent donc pas diverger de lui.
 *
 * Le lot est BORNÉ (quatre à la fois) et TOLÉRANT (chaque échec est rattrapé
 * dans la boucle) — voir `runNeedBulk`.
 */
export function useNeedActions() {
  const qc = useQueryClient()

  return useMutation<NeedBulkOutcome[], Error, NeedActionInput>({
    mutationFn: input => runNeedBulk(input.needIds, needId => applyOne(needId, input)),
    onSuccess: (outcomes, input) => {
      // On rafraîchit MÊME quand tout a échoué : un besoin peut avoir bougé
      // entre-temps, et c'est précisément la raison d'un « déjà dans cet état ».
      void qc.invalidateQueries({ queryKey: openNeedsKeys.all })
      void qc.invalidateQueries({ queryKey: ['projects'] })

      const { done, failed } = summariseNeedBulk(outcomes)
      // La raison du PREMIER refus voyage jusqu'à l'écran. « Une erreur est
      // survenue » ferait recliquer ; « ce besoin est déjà dans cet état » se
      // corrige.
      const firstReason = outcomes.find(outcome => outcome.status === 'failed')
      const description = firstReason?.status === 'failed' && firstReason.reason ? firstReason.reason : undefined

      if (failed === 0) {
        // Lancer un rapprochement n'est pas « mettre à jour un besoin » : rien
        // n'a changé sur la ligne, un moteur s'est mis à chercher. Le dire
        // autrement évite de faire chercher une modification qui n'existe pas.
        const message =
          input.kind === 'match'
            ? i18n.t('projects:openNeeds.bulk.matchStarted', { count: done })
            : i18n.t('projects:openNeeds.bulk.done', { count: done })
        toast.success(message)
        return
      }
      if (done === 0) {
        toast.error(i18n.t('projects:openNeeds.bulk.allFailed', { count: failed }), { description })
        return
      }
      toast.warning(i18n.t('projects:openNeeds.bulk.partial', { done, failed }), { description })
    },
    onError: error => toast.error(error.message || i18n.t('projects:openNeeds.bulk.allFailed', { count: 1 })),
  })
}

function applyOne(needId: string, input: NeedActionInput): Promise<unknown> {
  switch (input.kind) {
    // Le rapprochement ne passe PAS par la porte d'état : il a sa propre route,
    // et il n'écrit pas le statut du besoin — c'est le moteur qui le fera
    // avancer quand il aura trouvé.
    case 'match':
      return matchingApi.run(needId)
    // Réactiver n'exige rien et EFFACE le motif. Le `null` est envoyé, pas omis :
    // il DIT que la raison de l'arrêt meurt avec l'arrêt.
    case 'reactivate':
      return changeStatus(needId, needActionTargetStatus(input.kind), null)
    case 'hold':
    case 'close_lost':
    case 'close_cancelled':
      return changeStatus(
        needId,
        needActionTargetStatus(input.kind),
        input.reason,
        // #3389.13 — la date n'a de sens que sur la veille ; le serveur refuse le reste.
        input.kind === 'hold' ? (input.resumeOn ?? null) : null,
      )
    // `null` est une valeur ENVOYÉE, pas un champ omis : « retire le
    // propriétaire » et « je n'en parle pas » ne sont pas la même demande, et le
    // service ne distingue les deux que parce que la clé est présente.
    case 'assign_owner':
      return patchNeed(needId, { owner_id: input.ownerId })
    case 'set_urgency':
      return patchNeed(needId, { urgency: input.urgency })
    // #2173.48 — la MÊME route que « Prochaines étapes » sur la fiche d'un
    // besoin (`POST /projects/needs/:id/steps`) : une action de lot n'ouvre
    // aucune route de masse, elle rejoue l'appel unitaire qui existe déjà.
    case 'create_actions':
      return needStepsApi.create(needId, { label: input.label })
    // #2173.49 — deux portes dédiées, jamais le patch générique ni la porte
    // d'état : archiver n'écrit QUE `archived_at`, `status` n'est jamais dans
    // le corps de cette requête.
    case 'archive':
      return archiveNeed(needId, true)
    case 'unarchive':
      return archiveNeed(needId, false)
  }
}

/** La porte d'état — séparée du patch générique côté serveur, et c'est le point :
 *  le statut est le seul champ dont un mauvais réglage déplace du travail sans
 *  que personne ne l'ait décidé. */
function changeStatus(
  needId: string,
  status: NeedStoredStatus,
  reason: string | null,
  resumeOn: string | null = null,
): Promise<ProjectNeed> {
  return apiFetch<ProjectNeed, { status: NeedStoredStatus; reason: string | null; resume_on?: string }>({
    path: `/projects/needs/${needId}/status`,
    method: 'PATCH',
    // La clé n'est envoyée que posée : « pas de date » reste une veille sans échéance.
    body: { status, reason, ...(resumeOn ? { resume_on: resumeOn } : {}) },
  })
}

function patchNeed(needId: string, patch: UpdateProjectNeed): Promise<ProjectNeed> {
  return apiFetch<ProjectNeed, UpdateProjectNeed>({
    path: `/projects/needs/${needId}`,
    method: 'PATCH',
    body: patch,
  })
}

/**
 * #2173.49 — ARCHIVER / DÉSARCHIVER, séparée du patch générique ET de la
 * porte d'état — pas de corps : ce geste ne PORTE rien d'autre que son sens,
 * exactement pour qu'il ne puisse jamais toucher `status`.
 */
function archiveNeed(needId: string, archived: boolean): Promise<ProjectNeed> {
  return apiFetch<ProjectNeed>({
    path: `/projects/needs/${needId}/${archived ? 'archive' : 'unarchive'}`,
    method: 'POST',
  })
}
