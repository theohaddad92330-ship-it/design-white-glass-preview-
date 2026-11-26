/**
 * #3918 (lot Y12, 08/10/2026) — les seuils des signaux CRM dérivés du cache
 * `crm_deal_facts`, à UN seul endroit (GA-26) : `crm-deal-signal-rules.ts`
 * (apps/api) les lit, jamais une copie locale.
 *
 * Trois règles, chacune sur un fait DATÉ du cache — jamais une probabilité
 * (doctrine) :
 *  - `affaire_perdue` : une affaire CLÔTURÉE PERDUE, depuis au moins
 *    `lostMinMonths` mois pleins.
 *  - `affaire_dormante` : une affaire OUVERTE sans la moindre activité connue
 *    depuis au moins `dormantMinDays` jours — « activité connue » étant
 *    `last_activity_at` quand le cache le porte, sinon sa date de création
 *    (faute d'un fait plus récent, ce qui est NOMMÉ par l'appelant, jamais
 *    tu — voir `crm-deal-signal-rules.ts`).
 *  - `affaire_renouvellement` : une affaire GAGNÉE depuis au moins
 *    `renewalCycleDays` jours. Le cache ne porte aucune échéance de contrat
 *    (aucun fournisseur ne l'expose dans les propriétés lues aujourd'hui) :
 *    le cycle est une CADENCE connue, pas une date devinée — même principe que
 *    `NOT_NOW_REVALIDATION_DAYS` (playbook.ts) pour une pause commerciale.
 */
export const CRM_DEAL_SIGNAL_THRESHOLDS = {
  lostMinMonths: 1,
  dormantMinDays: 45,
  renewalCycleDays: 365,
} as const

export const CRM_DEAL_SIGNAL_KINDS = ['affaire_perdue', 'affaire_dormante', 'affaire_renouvellement'] as const
export type CrmDealSignalKind = (typeof CRM_DEAL_SIGNAL_KINDS)[number]

/**
 * #3918.a (lot M01, 09/10/2026) — la clé qui a rattaché un deal CRM à un
 * compte (`crm_deal_facts.account_link_basis`) : l'id société du fournisseur,
 * puis le SIREN, puis le domaine, puis — lot 762 P5, décision Louis 31/10 — le NOM normalisé de la société
 * CRM, UNIQUEMENT s'il est univoque dans l'espace (ambigu ⇒ non rattaché : on propose, on ne fusionne jamais). CHECK SQL : migration `1796437900101-CrmDealFactsAccountLink.ts`.
 */
export const CRM_DEAL_ACCOUNT_LINK_BASES = ['crm_company_id', 'siren', 'domain', 'name'] as const
export type CrmDealAccountLinkBasis = (typeof CRM_DEAL_ACCOUNT_LINK_BASES)[number]

/** Un deal du cache, réduit aux champs que les règles lisent. */
export type CrmDealSignalRow = {
  id: string
  name: string | null
  amount: string | null
  deal_created_at: Date | string | null
  closed_at: Date | string | null
  last_activity_at: Date | string | null
  is_closed: boolean
  is_won: boolean | null
}

/** Une détection, prête à devenir un `TriggerEvent` canonique (#2875). */
export type CrmDealSignalDraft = {
  kind: CrmDealSignalKind
  /** La clé primaire de `crm_deal_facts` — le deal EST le sujet, pas le
   *  compte : le cache ne porte aucun lien vers `accounts` aujourd'hui. */
  dealFactId: string
  /** Le fait, en une phrase, AVEC ses chiffres — même règle que
   *  `InterventionDraft.detail` (intervention-rules.ts). */
  evidence: string
  /** La date du FAIT (clôture ou dernière activité connue), jamais l'instant
   *  de la détection. */
  occurredAt: string
}
