import {
  parseRefreshDebitReason,
  REFRESH_DIMENSION_PHASE,
  REFRESH_MIN_INTERVAL_MS,
  type RefreshDimension,
} from '@bellum/contracts'
import type { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'

/** Ce qu'une ligne de débit du registre porte d'utile pour juger si elle était due. */
export type RefreshDebitRow = Pick<
  CreditLedgerEntity,
  'id' | 'owner_user_id' | 'workspace_id' | 'account_id' | 'reason' | 'delta' | 'created_at'
>

/** Un débit indu, avec le débit payé à bon droit qui avait ouvert sa fenêtre. */
export type UndueRefreshDebit = {
  debit: RefreshDebitRow
  dimension: RefreshDimension
  /** Ce qui a RÉELLEMENT été débité (`-delta`), jamais la grille du jour. */
  amount: number
  windowOpenedBy: { id: string; at: Date }
}

/**
 * #2650.2 (19/09/2026) — les débits de rafraîchissement INDUS, sur l'historique
 * du registre des crédits.
 *
 * La règle est celle que #2650.1 applique désormais au clic : un axe déjà payé
 * dans les 6 h (`REFRESH_MIN_INTERVAL_MS`, le même réglage — GA-26) ne se
 * refacture pas. Fenêtre GLISSANTE, par compte ET par PHASE : le premier débit
 * ouvre la fenêtre ; ceux pris avant son échéance sont indus ; le premier pris
 * à 6 h ou plus en ouvre une nouvelle. Un débit indu n'ouvre RIEN : sous la
 * règle corrigée il aurait été refusé, il ne peut donc pas servir d'ancre.
 *
 * Pure (aucune horloge, aucune base) — c'est ce qui la rend testable sur les
 * trois débits mesurés le 19/09/2026 dans l'espace de Louis.
 *
 * Ce qui n'est pas un débit de rafraîchissement LISIBLE est ignoré, jamais
 * deviné : motif autre que `refresh:<axe connu>`, compte absent, delta non
 * négatif. On ne rembourse pas ce qu'on ne sait pas relire.
 */
export function selectUndueRefreshDebits(
  rows: readonly RefreshDebitRow[],
  windowMs: number = REFRESH_MIN_INTERVAL_MS,
): UndueRefreshDebit[] {
  const readable = rows
    .map(debit => ({ debit, dimension: parseRefreshDebitReason(debit.reason), at: new Date(debit.created_at) }))
    .filter(
      (row): row is { debit: RefreshDebitRow; dimension: RefreshDimension; at: Date } =>
        row.dimension !== null && !!row.debit.account_id && row.debit.delta < 0 && Number.isFinite(row.at.getTime()),
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.debit.id.localeCompare(b.debit.id))

  const anchors = new Map<string, { id: string; at: Date }>()
  const undue: UndueRefreshDebit[] = []
  for (const row of readable) {
    // #2650.2 — groupé par PHASE, comme le verrou #2650.1
    // (`REFRESH_DIMENSION_PHASE`, une seule table) : `ecosystem` après
    // `signals` rejoue la même phase de recherche, déjà payée.
    const key = `${row.debit.account_id}|${REFRESH_DIMENSION_PHASE[row.dimension]}`
    const anchor = anchors.get(key)
    if (anchor && row.at.getTime() - anchor.at.getTime() < windowMs) {
      undue.push({ debit: row.debit, dimension: row.dimension, amount: -row.debit.delta, windowOpenedBy: anchor })
      continue
    }
    anchors.set(key, { id: row.debit.id, at: row.at })
  }
  return undue
}
