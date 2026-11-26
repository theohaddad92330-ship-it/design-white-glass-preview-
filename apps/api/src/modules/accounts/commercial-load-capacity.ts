import type { AccountOwner } from '@bellum/contracts'

/**
 * #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
 * LE MODÈLE D'ÉQUIPE MINIMAL branché dans `get_account_preflight`.
 *
 * Ce produit n'a aucun modèle d'équipe/permission multi-utilisateur
 * (`_team_scope_section`, RLS mono-utilisateur) — ce n'est PAS ce que cette
 * lecture invente. Elle réutilise la charge déclarée qui existe déjà
 * (Réglages › Charge commerciale, `workspace_commercial_load_settings`,
 * `WorkspaceCommercialLoadSettingsService`) et la croise avec le compte RÉEL
 * de dossiers déjà suivis par le commercial qui s'apprête à ouvrir celui-ci
 * (`accounts.assigned_to`) — rien d'autre n'est deviné. `AccountsService`
 * porte DÉJÀ `effortBudget` sur ce même réglage pour le portefeuille entier ;
 * cette lecture répond à une question différente (« ai-je de la place pour
 * CE compte précis », pas « où investir mon temps cette semaine ») donc vit
 * à part plutôt que de surcharger `EffortBudget`.
 */
export type CommercialLoadCapacity = {
  /** Le commercial qui s'apprête à ouvrir ce compte, nommé — `null` si son profil n'est plus lisible. */
  consultant: AccountOwner | null
  /** Plafond déclaré de dossiers suivis par commercial. `null` = non renseigné, jamais 0 (GA-18/GA-19). */
  maxTrackedAccounts: number | null
  /** Dossiers RÉELLEMENT suivis (`accounts.assigned_to`) par ce commercial, dans cet espace. */
  trackedAccountsCount: number
  /** Heures commerciales disponibles PAR SEMAINE, déclarées par l'espace. `null` = non renseigné. */
  weeklyAvailableHours: number | null
}
