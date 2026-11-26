import type {
  ApprovalSettingsView,
  UpdateApprovalSettings,
  ActionIntentType,
  ActionOutcome,
  ActionRisk,
  ListCanonicalActionsResponse,
  RunTrace,
  WorkflowActionPlan,
  WorkflowDefinition,
  WorkflowRunStatus,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Le client de l'Action OS.
 *
 * Les formes de run et d'approbation viennent de la base telle quelle
 * (snake_case) : les retyper en camelCase côté client créerait une troisième
 * représentation du même objet, qui divergerait au premier champ ajouté.
 *
 * ⚠️ Les ÉNUMÉRATIONS, elles, viennent du contrat et ne sont plus recopiées.
 * Elles l'étaient, et les deux listes avaient déjà divergé : le contrat gagnait
 * deux issues que le client ne connaissait pas. Une liste recopiée à la main est
 * la façon la plus discrète d'avoir deux vérités sur le même objet.
 */
type WorkflowRunStepView = {
  key: string
  intentType: ActionIntentType
  /** #2201.43 — la capacité (jamais l'éditeur), recopiée de la définition à l'exécution. */
  capability?: string
  outcome: ActionOutcome
  attempts: number
  externalRef: string | null
  creditsSpent: number
  reason: string | null
  startedAt: string | null
  finishedAt: string | null
}

export type WorkflowRunView = {
  id: string
  definition_key: string
  definition_version: number
  trigger: string
  status: WorkflowRunStatus
  account_id: string | null
  contact_id: string | null
  correlation_id: string
  steps: WorkflowRunStepView[]
  estimated_credits: number
  spent_credits: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  /**
   * #1498 — qui a déclenché, qui a validé, depuis quel objet. Le serveur la
   * calcule et l'envoie AVEC le run.
   *
   * ⚠️ Optionnelle côté client, et ce n'est pas de la prudence décorative : un
   * onglet resté ouvert pendant un déploiement lit une API qui ne l'envoie pas
   * encore. Un champ qui change de forme ne dégrade pas, il rend `undefined` —
   * et c'est ce qui a cassé un écran en production le 05/09.
   */
  trace?: RunTrace
  /**
   * #2865 — le run OFFRE-T-IL une relance manuelle ? Calculé côté serveur
   * (`WorkflowRunnerService.workflowRunCanRetry`, la même fonction que celle
   * qui exécute le geste) : jamais recalculé ici, un pas `unknown` ou un run
   * déjà entièrement réussi ne doit JAMAIS montrer le bouton.
   *
   * ⚠️ Optionnel pour la même raison que `trace` : un onglet ouvert pendant un
   * déploiement lit une API qui ne l'envoie pas encore.
   */
  canRetry?: boolean
  /**
   * X37 / #3416 — la prochaine action : la tâche ouverte la plus proche d'échéance
   * du MÊME compte, lue côté serveur. `null` = rien d'ouvert, aucune ligne.
   * Optionnelle pour la même raison que `trace`.
   */
  nextAction?: { title: string; dueOn: string | null } | null
  /**
   * #3416.x2 — le résultat RÉEL d'une analyse de compte (`CardResult.analysisFound`),
   * stocké sur le run au règlement. Absent = rien à dire, aucune ligne.
   */
  result?: { analysisFound?: { contacts: number; verifiedEmails: number } } | null
}

export type ApprovalRequestView = {
  id: string
  run_id: string
  required_level: string
  state: 'pending' | 'approved' | 'rejected' | 'expired'
  summary: string
  estimated_credits: number
  expires_at: string
  created_at: string
  /**
   * #2200.13 / #2200.14 / #2200.21 — la même traçabilité qu'un run déjà rendu
   * (`RunTraceLine`), désormais servie AUSSI sur la carte encore en attente
   * d'une décision : qui a déclenché, depuis quoi, et la prochaine étape.
   *
   * ⚠️ Optionnelle pour la même raison que `WorkflowRunView.trace` : un onglet
   * ouvert pendant un déploiement lit une API qui ne l'envoie pas encore.
   */
  trace?: RunTrace
  nextStepKey?: string | null
  /**
   * #2200.39 (épopée #2867) — le risque du PROCHAIN pas, calculé côté serveur
   * (`action-os.controller.ts`, `listApprovals`) depuis la définition du
   * workflow. `null` quand le run ou sa prochaine étape est introuvable —
   * jamais un niveau deviné.
   *
   * ⚠️ Optionnel pour la même raison que `trace` : un onglet ouvert pendant un
   * déploiement lit une API qui ne l'envoie pas encore.
   */
  risk?: ActionRisk | null
  /** L'auteur de la demande (identifiant) — celui dont le clic simple suffit. */
  requested_by?: string
  /**
   * #2864 — le collègue du même espace à qui la demande a été confiée.
   * #2856 — reportée jusqu'à cette date (la demande reste en attente).
   * ⚠️ Optionnels pour la même raison que `trace`.
   */
  assigned_to?: string | null
  snoozed_until?: string | null
}

/** Ce qu'un workflow peut produire — issues, arrêts, repli humain. */
export type WorkflowOutcomeView = {
  motion: string
  trigger: string
  outcomes: string[]
  stop: string[]
  fallback: string
}

export const actionOsApi = {
  workflows(): Promise<{
    workflows: WorkflowDefinition[]
    outcomes: Record<string, WorkflowOutcomeView>
    motionsWithoutContract: string[]
  }> {
    return apiFetch({ path: '/action-os/workflows' })
  },

  /**
   * La prévisualisation d'un workflow sur une cible.
   *
   * ⚠️ Le client web ne faisait que LIRE : `plan` et `start` n'avaient AUCUN
   * appelant. Aucun `workflow_run` n'était donc jamais créé en production, aucune
   * approbation ne pouvait exister, et le seul chemin câblé du runner n'avait
   * jamais rien à trancher.
   */
  plan(definitionKey: string, accountId?: string): Promise<{ plan: WorkflowActionPlan }> {
    return apiFetch({
      path: '/action-os/plan',
      method: 'POST',
      body: { definitionKey, ...(accountId ? { accountId } : {}) },
    })
  },

  /** Lance un run. `idempotencyKey` est fourni par le CLIENT : deux clics sur le
   *  même bouton ne produisent qu'un run. */
  start(input: {
    definitionKey: string
    idempotencyKey: string
    accountId?: string
    contactId?: string
  }): Promise<{ run: WorkflowRunView; plan: WorkflowActionPlan; reused: boolean }> {
    return apiFetch({ path: '/action-os/runs', method: 'POST', body: input })
  },
  runs(status?: string): Promise<{ runs: WorkflowRunView[] }> {
    return apiFetch({ path: `/action-os/runs${status ? `?status=${encodeURIComponent(status)}` : ''}` })
  },
  approvals(): Promise<{ approvals: ApprovalRequestView[] }> {
    return apiFetch({ path: '/action-os/approvals' })
  },
  /**
   * #2395 — mes actions ouvertes de TOUTES les maisons (plan, tâches, appels),
   * au contrat canonique. Une maison illisible revient nommée dans `unavailable`.
   */
  actions(): Promise<ListCanonicalActionsResponse> {
    return apiFetch({ path: '/action-os/actions' })
  },
  /**
   * #2871 — le plan d'UN compte au contrat canonique (fiche compte) : étapes du
   * plan généré projetées en lecture seule + lignes persistées, par les MÊMES
   * adaptateurs que {@link actions}. Une étape actée y porte l'id de sa ligne.
   */
  accountActions(accountId: string): Promise<ListCanonicalActionsResponse> {
    return apiFetch({ path: `/accounts/${encodeURIComponent(accountId)}/actions` })
  },
  /** #2864 — confier la demande à un collègue du même espace (`null` = retirer). */
  assign(id: string, assigneeId: string | null): Promise<{ approval: ApprovalRequestView }> {
    return apiFetch({ path: `/action-os/approvals/${id}/assign`, method: 'POST', body: { assigneeId } })
  },
  /** #2856 — reporter la demande jusqu'à `until` (`null` = la réveiller). */
  snooze(id: string, until: string | null): Promise<{ approval: ApprovalRequestView }> {
    return apiFetch({ path: `/action-os/approvals/${id}/snooze`, method: 'POST', body: { until } })
  },
  decide(id: string, decision: 'approve' | 'reject', reason?: string): Promise<{ run: WorkflowRunView }> {
    return apiFetch({
      path: `/action-os/approvals/${id}`,
      method: 'POST',
      body: { decision, ...(reason ? { reason } : {}) },
    })
  },
  /** #2865 — relance un run MULTI-PAS depuis le pas en échec. Corps vide : le
   *  statut persisté du run décide, jamais un paramètre du client. */
  retryRun(id: string): Promise<{ run: WorkflowRunView }> {
    return apiFetch({ path: `/action-os/runs/${id}/retry`, method: 'POST', body: {} })
  },
  /** #4016 L6 — l'autonomie de l'espace (N2-N5) et ses deux seuils. */
  approvalSettings(): Promise<ApprovalSettingsView> {
    return apiFetch<ApprovalSettingsView>({ path: '/action-os/approval-settings' })
  },
  /** #4016 L6 — réservé à qui gère l'équipe ; `null` revient au défaut produit. */
  updateApprovalSettings(body: UpdateApprovalSettings): Promise<ApprovalSettingsView> {
    return apiFetch<ApprovalSettingsView, UpdateApprovalSettings>({
      path: '/action-os/approval-settings',
      method: 'PUT',
      body,
    })
  },
}

export const actionOsKeys = {
  workflows: ['action-os', 'workflows'] as const,
  runs: (status?: string) => ['action-os', 'runs', status ?? 'all'] as const,
  approvals: ['action-os', 'approvals'] as const,
  approvalSettings: ['action-os', 'approval-settings'] as const,
  actions: ['action-os', 'actions'] as const,
  accountActions: (accountId: string) => ['action-os', 'actions', 'account', accountId] as const,
}
