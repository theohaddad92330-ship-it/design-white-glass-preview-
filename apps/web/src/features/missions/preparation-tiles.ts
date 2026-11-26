type TileRow = { state: string; preparedAmountCents: number | null }
type TileSummary = {
  ready: number
  blocked: number
  invoiced: number
  invoicedDeclared: number
  preparedInvoicesCount: number
}

type PreparationTiles = {
  /** `amountCents: null` : pas de droit financier, aucun dossier prêt, ou un dossier prêt sans montant. */
  ready: { count: number | null; amountCents: number | null }
  blocked: number | null
  prepared: number | null
  /** `issued.count` compte le lu ET le déclaré ; `declared` dit la part non confirmée. */
  issued: { count: number; declared: number } | null
}

/**
 * Théo C missions-preparation.R1 — les quatre tuiles montants (Prêt à préparer ·
 * À débloquer · Brouillons · Déjà émis). Une valeur non mesurée reste `null` :
 * jamais un 0, jamais un total partiel présenté comme complet.
 */
export function preparationTiles(
  rows: readonly TileRow[],
  summary: TileSummary | undefined,
  canReadFinance: boolean,
): PreparationTiles {
  if (!summary) return { ready: { count: null, amountCents: null }, blocked: null, prepared: null, issued: null }
  const readyRows = rows.filter(row => row.state === 'ready')
  const complete = canReadFinance && readyRows.length > 0 && readyRows.every(row => row.preparedAmountCents !== null)
  const amountCents = complete ? readyRows.reduce((total, row) => total + (row.preparedAmountCents as number), 0) : null
  return {
    ready: { count: summary.ready, amountCents },
    blocked: summary.blocked,
    prepared: summary.preparedInvoicesCount,
    issued: { count: summary.invoiced + summary.invoicedDeclared, declared: summary.invoicedDeclared },
  }
}
