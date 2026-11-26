/**
 * #4423.2 — LA définition des chiffres « comptes » du back-office, écrite UNE fois.
 *
 * La fiche utilisateur disait « 281 analyses lancées, 5 terminées, 5 suivies » ; la vue ESN, « 6 analyses
 * terminées, 280 comptes actifs » pour le même client. Chaque écran recomptait de son côté, sur une autre
 * table (`accounts` d'un côté, `analysis_runs` de l'autre), avec son propre filtre : deux sommes justes, aucune
 * comparable. Les deux lisent maintenant ces cellules `(statut, statut commercial, effectif)` par CETTE fonction.
 *
 *  - lancés   : tout compte dont une analyse a été lancée (toutes lignes de `accounts`, archivés compris) ;
 *  - terminés : `accounts.status = 'completed'` — ce que Laura appelle un « compte analysé » ;
 *  - actifs   : `commercial_status` autre qu'archivé — « Comptes actifs » de la vue ESN ;
 *  - suivis   : `commercial_status` suivi et non supprimé — « Comptes suivis » de l'app ;
 *  - chauds   : `commercial_status = 'opportunity'`.
 * « Actifs » n'est donc pas « lancés » : l'écart, ce sont les comptes archivés.
 */
export type AccountStatusCell = { status: string; commercialStatus: string; count: number }

export type AccountPopulation = {
  launched: number
  completed: number
  active: number
  followed: number
  hot: number
}

const FOLLOWED_COMMERCIAL_STATUSES: ReadonlySet<string> = new Set(['watching', 'opportunity', 'opening', 'customer'])

export function countAccountPopulation(cells: readonly AccountStatusCell[]): AccountPopulation {
  const population: AccountPopulation = { launched: 0, completed: 0, active: 0, followed: 0, hot: 0 }
  for (const { status, commercialStatus, count } of cells) {
    population.launched += count
    if (status === 'completed') population.completed += count
    if (commercialStatus !== 'archived') population.active += count
    if (FOLLOWED_COMMERCIAL_STATUSES.has(commercialStatus) && status !== 'deleted') population.followed += count
    if (commercialStatus === 'opportunity') population.hot += count
  }
  return population
}

/** Des lignes `accounts` en cellules — pour l'écran qui lit les comptes un à un. */
export function cellsOfAccounts(
  rows: ReadonlyArray<{ status: string; commercial_status: string }>,
): AccountStatusCell[] {
  return rows.map(row => ({ status: row.status, commercialStatus: row.commercial_status, count: 1 }))
}
