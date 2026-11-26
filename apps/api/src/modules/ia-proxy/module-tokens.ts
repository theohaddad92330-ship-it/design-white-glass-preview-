/**
 * #3272.6 — le jeton de lecture des REX de perte pour `ChatContextService`.
 * GA-07 (`module-boundaries.spec.ts`) est un CLIQUET au plafond : « aucun
 * module n'importe le SERVICE d'un autre module ». `ChatContextService` n'a
 * pas besoin de `CapitalisationService` entier, il a besoin de « les REX de
 * perte de ce compte, condensés ». La composition se fait donc dans
 * `ia-proxy.module.ts` (même patron que `business-metrics/module-tokens.ts`
 * et `weakest-link-diagnosis/module-tokens.ts`).
 */

export const LOST_DEAL_REX_CONTEXT = 'IA_PROXY_LOST_DEAL_REX_CONTEXT'

/** `null` = compte absent ou sans aucun REX de perte connu. */
export type LostDealRexContextReader = (account: { id: string; workspace_id?: string | null }) => Promise<string | null>

/**
 * #3295 — le jeton de lecture des règles APPRISES de l'espace (propositions
 * d'apprentissage adoptées, puis activées), condensées. Même discipline GA-07
 * que `LOST_DEAL_REX_CONTEXT` : `ChatContextService` n'importe pas le service
 * de `capitalisation`, la composition se fait dans `ia-proxy.module.ts`.
 */
export const WORKSPACE_LEARNED_RULES_CONTEXT = 'IA_PROXY_WORKSPACE_LEARNED_RULES_CONTEXT'

/** `null` = aucune règle activée dans cet espace. */
export type WorkspaceLearnedRulesContextReader = (workspaceId: string) => Promise<string | null>

/**
 * #3390.10/.11 — le jeton de lecture de la MÉTHODE COMMERCIALE retenue pour le
 * besoin ouvert d'un compte (`NeedVerdictService` + `renderLauraCommercialMethodContext`).
 * Même discipline GA-07 que les jetons ci-dessus : `ChatContextService`
 * n'importe pas le service du module `projects`, la composition se fait dans
 * `ia-proxy.module.ts`.
 */
export const COMMERCIAL_METHOD_CONTEXT = 'IA_PROXY_COMMERCIAL_METHOD_CONTEXT'

/** `null` = aucun besoin ouvert sur ce compte (ou illisible) : rien n'est dit, aucune méthode devinée. */
export type CommercialMethodContextReader = (args: {
  workspaceId: string
  accountId: string
  userId: string
}) => Promise<string | null>

/**
 * #4071.1 — le jeton de lecture des FAITS DU COMPTE (socle #4069,
 * `AccountFactsService`), déjà mis en texte par `accountFactsContextFor`.
 * Même discipline GA-07 que les jetons ci-dessus : la composition se fait
 * dans `ia-proxy.module.ts`. `userId` est REQUIS : les documents personnels
 * ne sont lus que pour leur auteur (#4071.4).
 */
export const ACCOUNT_FACTS_CONTEXT = 'IA_PROXY_ACCOUNT_FACTS_CONTEXT'

/**
 * #4071.3 — le jeton de lecture de ce que l'ESPACE a gardé : recherches enregistrées, listes de cibles et
 * résumés des conversations passées de la personne (`workspaceRecallContextFor`). Niveau espace, pas compte.
 * Même discipline GA-07 : la composition se fait dans `ia-proxy.module.ts`.
 */
export const WORKSPACE_RECALL_CONTEXT = 'IA_PROXY_WORKSPACE_RECALL_CONTEXT'

/** `null` = rien de gardé, ou lecture en échec : rien n'est dit. `excludeConversationId` : le fil en cours (son résumé est déjà dans la mémoire). */
export type WorkspaceRecallContextReader = (args: {
  workspaceId: string
  userId: string
  excludeConversationId?: string | null
}) => Promise<string | null>

/** `null` = compte hors espace, aucun fait, ou lecture en échec : rien n'est dit. */
export type AccountFactsContextReader = (args: {
  workspaceId: string
  accountId: string
  userId: string
}) => Promise<string | null>

/**
 * #4759 (HIST-E) — le jeton de l'AGRÉGAT de l'historique des besoins de chaque compte du digest : nombre,
 * période, dernier besoin vu (daté), technos dominantes. Une ligne de texte par compte, ou rien (« on
 * n'affiche pas ce qu'on n'a pas »). Le détail se lit à la demande par l'outil de Laura
 * (`POST /internal/copilot/account/needs-history`). Même discipline GA-07 : composé dans `ia-proxy.module.ts`.
 */
export const NEEDS_HISTORY_CONTEXT = 'IA_PROXY_NEEDS_HISTORY_CONTEXT'

export type NeedsHistoryContextReader = (args: {
  workspaceId: string
  accountIds: string[]
}) => Promise<Map<string, string>>
