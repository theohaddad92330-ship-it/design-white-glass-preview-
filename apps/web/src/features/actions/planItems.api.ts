import type {
  ActionPlanItem,
  CloseStalePlanItemsResult,
  AwaitingOutcomeAction,
  CreatedPlanAction,
  CreatePlanAction,
  MyPlanAction,
  PrepareContactPlan,
  SendTiming,
  UpdateActionPlanItem,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2123.46 — une action du plan telle qu'un ÉCRAN la compose : tout le corps de
 * `POST /plan-items` sauf le compte, que le hook appelant connaît déjà. La
 * veille, la fiche contact, le panneau besoin et l'ajout en masse la
 * construisent ; une seule porte l'écrit.
 */
export type PlanActionInput = Omit<CreatePlanAction, 'account_id'>

/** Thin client over the NestJS `/plan-items` surface (interactive action plan). */
export const planItemsApi = {
  list(accountId: string): Promise<ActionPlanItem[]> {
    return apiFetch<ActionPlanItem[]>({ path: `/plan-items?account_id=${encodeURIComponent(accountId)}` })
  },
  /**
   * Le dernier résultat déclaré de PLUSIEURS comptes en un appel (briefing) — une ligne par compte
   * qui en porte un, aucune pour les autres. Remplace N `list(accountId)` pour ce seul besoin.
   */
  lastOutcomes(accountIds: readonly string[]): Promise<ActionPlanItem[]> {
    return apiFetch<ActionPlanItem[]>({
      path: `/plan-items/last-outcomes?account_ids=${accountIds.map(encodeURIComponent).join(',')}`,
    })
  },
  /**
   * #2123.46 / #2114.46/.57 — MES actions ouvertes, tous comptes confondus,
   * pour l'écran `/actions`. Même porte, même ligne `action_plan_items` que
   * {@link list} : aucune copie locale (#2123.47).
   *
   * La route existe depuis #2123.46 et n'avait AUCUN appelant côté web : le
   * Centre d'actions est son premier lecteur. Le serveur sait toujours qui
   * appelle et sur quel espace — `overdue` ne fait que RESTREINDRE cette même
   * portée, il ne la redéfinit jamais côté client.
   *
   * #2717 — `overdue: true` restreint à la MÊME portée que la tuile « En
   * retard » du Dashboard (`countPersonalRelances().overdue`, côté API) :
   * voir `ActionPlanItemsService.listOpenForUser`.
   */
  mine(params?: { overdue?: boolean }): Promise<MyPlanAction[]> {
    const path = params?.overdue ? '/plan-items/mine?overdue=true' : '/plan-items/mine'
    return apiFetch<MyPlanAction[]>({ path })
  },
  /**
   * #4418.1 — le TOTAL des actions ouvertes que {@link mine} plafonne à 200 lignes (même portée, même filtre
   * « en retard »). `null` = lecture impossible, jamais « 0 » : l'écran ne dit rien plutôt qu'un faux écart.
   */
  mineCount(params?: { overdue?: boolean }): Promise<{ open: number } | null> {
    const path = params?.overdue ? '/plan-items/mine/count?overdue=true' : '/plan-items/mine/count'
    return apiFetch<{ open: number } | null>({ path })
  },
  /**
   * #3211.9 (#3234, lot M11) — la FILE PROACTIVE « Issues à déclarer » : mes
   * actions faites sans issue. `null` = lecture impossible (jamais « rien »).
   */
  awaitingOutcome(): Promise<AwaitingOutcomeAction[] | null> {
    return apiFetch<AwaitingOutcomeAction[] | null>({ path: '/plan-items/awaiting-outcome' })
  },
  /**
   * #3289 (#3264.31/.32/.33) — le créneau d'envoi que l'ESPACE a appris, par
   * canal, mesuré sur les gestes faits et leurs issues déclarées. `null` =
   * lecture impossible côté serveur (jamais « aucun créneau »).
   */
  sendTiming(): Promise<SendTiming | null> {
    return apiFetch<SendTiming | null>({ path: '/plan-items/send-timing' })
  },
  /**
   * #2123.46 / #2123.47 — LA porte de création d'une action du plan, et la
   * SEULE : le formulaire du plan, la veille, la fiche contact, le panneau
   * besoin et l'ajout en masse de contacts passent tous par elle.
   *
   * Elle écrit UNE ligne `action_plan_items` : celle que le plan du compte
   * affiche et que {@link mine} liste sur `/actions`. Ces cinq écrivains
   * écrivaient jusque-là dans `raw_analysis.user_plan_actions`, un blob que
   * l'écran Actions ne lit pas et qu'une ré-analyse remplace en entier.
   *
   * La réponse dit si la ligne VIENT d'être écrite (`added`) : une action
   * ouverte de même libellé et même objet n'est pas écrite deux fois.
   */
  create(input: CreatePlanAction): Promise<CreatedPlanAction> {
    return apiFetch<CreatedPlanAction, CreatePlanAction>({ path: '/plan-items', method: 'POST', body: input })
  },
  /**
   * #4416 — « Préparer un plan pour <prénom> » : 2-3 étapes pour UN contact, rangées dans le plan du compte
   * (les mêmes lignes que {@link create} — un seul plan). Le serveur refuse un compte hors de l'espace ou un
   * contact qui n'est pas de ce compte.
   */
  prepareForContact(input: PrepareContactPlan): Promise<ActionPlanItem[]> {
    return apiFetch<ActionPlanItem[], PrepareContactPlan>({
      path: '/plan-items/for-contact',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #4485 — « Proposer de les clore » : marque faites, après le clic, les actions vieilles de plus de 30 jours.
   * Le serveur vérifie que chacune est la mienne (404 sinon) et ne ferme que les ouvertes et anciennes.
   */
  closeStale(ids: readonly string[]): Promise<CloseStalePlanItemsResult> {
    return apiFetch<CloseStalePlanItemsResult, { ids: readonly string[] }>({
      path: '/plan-items/close-stale',
      method: 'POST',
      body: { ids },
    })
  },
  update(id: string, patch: UpdateActionPlanItem): Promise<ActionPlanItem> {
    return apiFetch<ActionPlanItem, UpdateActionPlanItem>({
      path: `/plan-items/${id}`,
      method: 'PATCH',
      body: patch,
    })
  },
}
