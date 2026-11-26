/**
 * #2442.13 (épopée #2879 — observabilité chat) — « action
 * validée/exécutée/premier succès/désactivation » par ESPACE. Chokepoint
 * trouvé : `approval_requests` (`workspace_id, state, created_at DESC`,
 * migration `ActionOs`) porte déjà CHAQUE décision d'approbation, et
 * `workflow_runs` (`workspace_id, status`, même migration) CHAQUE exécution —
 * les deux existaient déjà pour `manager-kpi.service.ts::validatedActionCadence`,
 * mais SANS granularité par espace (cadence globale, hebdomadaire). Ici : une
 * agrégation identique, scopée à un `workspaceId`.
 *
 * « Désactivation » (le 4e mot du point) — lot R16 (07/10) : les 11 bilans
 * précédents disaient « second chokepoint non vérifié ». Il existe déjà :
 * `WorkflowRunEntity.intents` (`workflow-run.entity.ts:101-102`) stocke le
 * CONTENU de l'intent dispatché, et `toggleRoutineActionSchema`
 * (`@bellum/contracts`, `copilot-card.ts:270-281`) porte `enabled: boolean` en
 * clair dessus — un run `toggle_routine` exécuté avec `enabled: false` EST la
 * désactivation, sans producteur neuf.
 */

export type ActionOsAdoptionMetrics = {
  /** `approval_requests.state = 'approved'` dans la fenêtre — l'utilisateur a VALIDÉ l'action. */
  validated: number
  /** `workflow_runs.status IN ('done', 'partial')` dans la fenêtre — l'action est PARTIE. */
  executed: number
  /** Parmi les runs exécutés dans la fenêtre, ceux dont un intent `toggle_routine` porte `enabled: false`. */
  disabled: number
  /** Date du tout premier run réussi (`status = 'done'`) de cet espace, toutes fenêtres confondues. `null` si aucun. */
  firstSuccessAt: string | null
}

/** PURE — assemble les quatre comptes déjà scopés par la requête SQL du service ; ne recalcule rien. */
export function computeActionOsAdoptionMetrics(input: {
  validated: number
  executed: number
  disabled: number
  firstSuccessAt: string | Date | null
}): ActionOsAdoptionMetrics {
  return {
    validated: input.validated,
    executed: input.executed,
    disabled: input.disabled,
    firstSuccessAt: input.firstSuccessAt ? new Date(input.firstSuccessAt).toISOString() : null,
  }
}
