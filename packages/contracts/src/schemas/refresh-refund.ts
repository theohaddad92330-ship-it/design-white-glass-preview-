import { refreshDimensionSchema, type RefreshDimension } from './analysis.js'

/**
 * #2650.2 (19/09/2026) — LE REMBOURSEMENT D'UN RAFRAÎCHISSEMENT DÉJÀ PAYÉ.
 *
 * #2650.1 a corrigé la règle pour l'avenir : un second rafraîchissement du
 * même axe, dans les 6 h qui suivent un premier débit, est refusé. Mesuré le
 * 19/09/2026 dans l'espace de Louis : trois débits `refresh:signals` pris
 * AVANT le correctif, chacun à moins de 6 h d'un premier débit du même axe
 * sur le même compte. Décision Louis 19/09/2026 : on REMBOURSE, par un geste
 * unique d'opérateur (doctrine « un correctif RATTRAPE l'existant — ciblé,
 * jamais tout le parc, ne part pas seul au déploiement »).
 *
 * Ce fichier porte LE CONTRAT du motif, parce qu'il a deux lecteurs : l'API
 * l'écrit au registre des crédits (`credit_ledger.reason`), le relevé de
 * crédits de l'écran Facturation le relit pour afficher « Remboursement :
 * rafraîchissement déjà payé dans les 6 h ». Deux copies du format
 * divergeraient au premier changement (GA-26).
 *
 * Le motif porte la RÉFÉRENCE du débit remboursé : c'est elle qui prouve
 * qu'un débit ne se rembourse jamais deux fois (index unique partiel
 * `credit_ledger_refresh_refund_once_idx`, migration `1789810829875`).
 */
export const REFRESH_REFUND_REASON_PREFIX = 'refund:refresh-within-6h'

/** Le motif EXACT qu'écrit `AnalysisRefreshService` sur son débit :
 *  `refresh:<axe>` — rien avant, rien après. */
const REFRESH_DEBIT_REASON = /^refresh:([a-z_]+)$/

const REFRESH_REFUND_REASON = /^refund:refresh-within-6h:([a-z_]+) \(debit ([0-9a-f-]{36})\)$/

function asDimension(raw: string | undefined): RefreshDimension | null {
  const parsed = refreshDimensionSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** Le motif de la ligne de remboursement d'UN débit de rafraîchissement. */
export function refreshRefundReason(dimension: RefreshDimension, debitId: string): string {
  return `${REFRESH_REFUND_REASON_PREFIX}:${dimension} (debit ${debitId})`
}

/**
 * Relit une ligne de remboursement — `null` pour tout autre motif, et pour un
 * axe que le produit ne sait pas rafraîchir (on ne relit pas ce qu'on
 * n'écrit pas).
 */
export function parseRefreshRefundReason(
  reason: string | null | undefined,
): { dimension: RefreshDimension; debitId: string } | null {
  const match = REFRESH_REFUND_REASON.exec(reason ?? '')
  if (!match) return null
  const dimension = asDimension(match[1])
  return dimension && match[2] ? { dimension, debitId: match[2] } : null
}

/** L'axe d'un débit de rafraîchissement (`refresh:<axe>`), `null` sinon. */
export function parseRefreshDebitReason(reason: string | null | undefined): RefreshDimension | null {
  const match = REFRESH_DEBIT_REASON.exec(reason ?? '')
  return match ? asDimension(match[1]) : null
}
