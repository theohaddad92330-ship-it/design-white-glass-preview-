import { toCsv } from '@/lib/csv'

/** Une ligne du journal telle qu'affichée — l'export reprend la vue TELLE QU'ELLE EST (mêmes filtres). */
export interface JournalExportRow {
  at: string
  member: string
  fact: string
  account: string
}

interface JournalExportLabels {
  headers: { date: string; member: string; fact: string; account: string }
}

/**
 * Théo D team-activite.N1 — « Exporter cette vue » : le CSV du journal filtré. Contenu = faits métier
 * uniquement (le journal n'en porte pas d'autres). Une valeur absente est une cellule VIDE, jamais « 0 ».
 * Sort par `downloadCSV`, donc par la règle d'espace (`TeamActivityView` lit `useDataExit()`).
 */
export function journalCsv(rows: readonly JournalExportRow[], labels: JournalExportLabels): string {
  return toCsv([
    [labels.headers.date, labels.headers.member, labels.headers.fact, labels.headers.account],
    ...rows.map(row => [row.at, row.member, row.fact, row.account]),
  ])
}
