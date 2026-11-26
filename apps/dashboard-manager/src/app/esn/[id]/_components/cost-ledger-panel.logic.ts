import type { WorkspaceCostLedgerEntry } from '@/lib/workspace-cost-ledger'

/** #2440.46 — le statut que l'IA pose sur une ligne de ledger refusée par le fournisseur (429 / surcharge). */
const STATUT_LIMITE_FOURNISSEUR = 'provider_limit'

/** L'étiquette d'une ligne en limite fournisseur ; `null` pour toute autre (on n'étiquette pas ce qu'on ne sait pas). */
// #2440.46 — la limite fournisseur se lit sur la fiche ESN.
export function libelleStatutLedger(entry: Pick<WorkspaceCostLedgerEntry, 'status'>): string | null {
  return entry.status === STATUT_LIMITE_FOURNISSEUR ? 'Limite fournisseur — aucun débit' : null
}

/**
 * Le coût d'UNE ligne du ledger. `null` = fournisseur non tarifé sur cet
 * environnement — ce n'est PAS gratuit, et l'écrire « 0,00 $ » le ferait
 * croire (doctrine : une valeur absente ne s'affiche jamais « 0 »).
 */
export function libelleCoutUsd(entry: Pick<WorkspaceCostLedgerEntry, 'costUsd'> & { status?: string | null }): string {
  if (entry.costUsd === null) return 'non tarifé'
  // #2440.46 — un appel refusé par une limite n'a rien facturé : « non facturé », pas un prix à 0.
  if (entry.status === STATUT_LIMITE_FOURNISSEUR) return 'non facturé'
  return `${entry.costUsd.toFixed(2)} $`
}
