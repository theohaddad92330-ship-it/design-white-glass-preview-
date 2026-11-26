// Client des coûts fournisseurs (D19, #1661). Appelé CÔTÉ SERVEUR uniquement —
// le secret interne ne doit jamais atteindre le navigateur. Même forme que
// src/lib/business-metrics.ts et src/lib/telemetry.ts.
//
// ⚠️ AUCUNE ÉCRITURE ICI. Ce fichier lit deux mesures ; rien de ce qu'il touche
// ne change un prix, une facture ou un crédit.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Une ligne d'agrégat. `untariffed` = combien de lignes n'ont AUCUN prix. */
export type CostAggregate = {
  key: string
  calls: number
  units: number
  cost_usd: number
  untariffed: number
}

/**
 * Une journée de la série, en UNION — jamais `costUsd: number | null`.
 *
 * ⚠️ C'est le type qui rend le `?? 0` INUTILE à l'écran (GA-19) : après
 * `if (jour.measured)`, TypeScript sait que `costUsd` est un nombre. Un type
 * plat obligerait chaque lecteur à écrire un repli sur zéro qui, un jour,
 * afficherait « 0 $ dépensé » sur une journée dont le registre n'a rien vu.
 *
 * ⚠️ Et « 0 $ » RESTE VRAI quand il est mesuré : `measured: true, costUsd: 0`
 * est une journée où des fournisseurs TARIFÉS n'ont rien coûté. On ne masque
 * pas un vrai zéro, on refuse d'en fabriquer un faux.
 */
export type CostDay =
  | { day: string; measured: true; costUsd: number; perProvider: Readonly<Record<string, number>>; untariffed: number }
  | { day: string; measured: false; costUsd: null; perProvider: Readonly<Record<string, never>>; untariffed: number }

/**
 * Le verdict de pic quotidien (#1661 : « > 150 % de la médiane 7 jours »).
 *
 * La dérivation vit CÔTÉ API, à un seul endroit
 * (`apps/api/src/modules/analytics/cost-alert.ts`, `detectDailyCostSpike`) :
 * l'écran la LIT, il ne la refait pas. Les trois `false` nommés sont ce qui
 * permet à l'écran de dire POURQUOI il ne se prononce pas, plutôt que d'afficher
 * un « tout va bien » qu'aucune mesure ne soutient.
 */
export type CostSpike =
  | { spike: false; reason: 'not_enough_days'; observedDays: number; requiredDays: number }
  | { spike: false; reason: 'baseline_is_zero'; observedDays: number }
  | { spike: false; reason: 'day_not_measured'; day: string }
  | {
      spike: false
      reason: 'under_threshold'
      day: string
      costUsd: number
      medianUsd: number
      ratio: number
      /** Le montant du seuil, calculé par l'API. L'écran ne recopie pas « 150 % ». */
      thresholdUsd: number
    }
  | { spike: true; day: string; costUsd: number; medianUsd: number; ratio: number; thresholdUsd: number }

/** Combien de clés distinctes existent par axe borné — un top 20 n'est pas un total. */
type CostDistinctKeys = {
  operation: number
  workspace: number
  account: number
}

export type CostOverview = {
  days: number
  byProvider: CostAggregate[]
  byFeature: CostAggregate[]
  /** Par PROMPT / verbe fournisseur. Borné aux 20 plus chers — voir `distinctKeys`. */
  byOperation: CostAggregate[]
  /**
   * #2442.12 — par OUTIL de Laura. Seules les lignes d'un outil y entrent (aucune ligne « — »).
   * Borné aux 20 plus chers. Coût fournisseur du produit, jamais agrégé entre espaces (GA-43).
   */
  byTool: CostAggregate[]
  /** #3861.R2 — par palier de raisonnement du copilote (`bellum_chat`, `_fast`, `_deep`). Coût seul : la latence n'est pas persistée. */
  byTier: CostAggregate[]
  /** Borné aux 20 espaces les plus chers — voir `distinctKeys`. */
  byWorkspace: CostAggregate[]
  topAccounts: CostAggregate[]
  total: CostAggregate
  byDay: CostDay[]
  distinctKeys: CostDistinctKeys
  costSpike: CostSpike
}

/**
 * La marge brute de BELLUM (D436), telle que l'API la rend.
 *
 * ⚠️ `blockedReason: 'currency_mismatch'` est la réponse RÉELLE en production,
 * et ce n'est pas une panne : le revenu est en EUR (grille des offres), le
 * registre des coûts en USD (`PROVIDER_UNIT_COST_*`), et **Bellum ne convertit
 * rien** — un taux appliqué à la volée ferait diverger la comptabilité de ce
 * que le client a vu. L'écran affiche le refus AVEC sa raison ; il n'invente
 * pas de taux pour remplir la case.
 */
export type BellumMargin = {
  measurability: { measurable: boolean; observed: number; required: number; missing: number }
  /** `null` tant que non mesurable. JAMAIS 0 % par défaut. */
  marginRate: number | null
  blockedReason: 'currency_mismatch' | null
  /** Les postes de coût FIXE que ce calcul exclut structurellement. */
  fixedCostsExcluded: readonly { label: string; reason: string }[]
  /** Vrai dès qu'une ligne de coût n'a pas de prix : le coût est un PLANCHER. */
  isFloor: boolean
}

/**
 * Coûts fournisseurs (D19). Backoffice UNIQUEMENT — décision Louis 31/07 : la
 * marge par client ne sort jamais côté application.
 */
export async function fetchCosts(days = 30): Promise<CostOverview> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/costs?days=${days}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Endpoint coûts: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CostOverview
}

/** La marge brute de Bellum, seule (D436). Back-office uniquement, comme les coûts. */
export async function fetchBellumMargin(days = 30): Promise<BellumMargin> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/bellum-margin?days=${days}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Endpoint marge: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as BellumMargin
}
