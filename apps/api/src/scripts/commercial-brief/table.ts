import type { GridRow, GridSheet } from './xlsx-grid'

/**
 * Un onglet tabulaire des briefs : 1 ligne de titre, 1 ligne de sous-titre,
 * 0..n lignes de note (une seule cellule), PUIS la ligne d'en-tête (la première
 * à porter au moins deux cellules), PUIS les données. Les trois premières
 * strates ne sont jamais perdues : titre → titre de section, sous-titre et
 * notes → section `notes`.
 *
 * L'accès aux colonnes est PISTÉ : une colonne que ni le plan de l'onglet ni sa
 * liste `dropped` (avec la raison) ne touche fait échouer la conversion —
 * « aucune colonne ignorée en silence ».
 */

export type TextCleaner = (sheet: string, text: string) => string

export type Row = {
  n: number
  /** Texte de la colonne `header`, ou undefined si la cellule est vide. */
  get: (header: string) => string | undefined
  /** Cible du lien hypertexte de la colonne `header`, sinon undefined. */
  link: (header: string) => string | undefined
}

export type Table = {
  sheet: string
  title: string
  subtitle?: string
  notes: string[]
  headers: string[]
  rows: Row[]
  /** En-têtes lus au moins une fois par un plan. */
  touched: Set<string>
  /** Nombre de cellules renseignées par colonne (sans compter comme lecture). */
  filled: Map<string, number>
}

const ordered = (rows: GridRow[]): GridRow[] => [...rows].sort((a, b) => a.n - b.n)

export const buildTable = (sheet: GridSheet, clean: TextCleaner): Table => {
  const rows = ordered(sheet.rows)
  const headerIdx = rows.findIndex((row, i) => i >= 1 && row.cells.size >= 2)
  if (headerIdx < 1) throw new Error(`[${sheet.name}] aucune ligne d'en-tête trouvée`)
  const single = (row: GridRow): string => clean(sheet.name, [...row.cells.values()][0])
  const head = rows.slice(0, headerIdx)
  for (const row of head) {
    if (row.cells.size !== 1) throw new Error(`[${sheet.name}] ligne ${row.n} avant l'en-tête avec plusieurs cellules`)
  }
  const headerRow = rows[headerIdx]
  const byCol = new Map<number, string>()
  for (const [col, label] of headerRow.cells) byCol.set(col, clean(sheet.name, label))
  const headers = [...byCol.values()]
  if (new Set(headers).size !== headers.length)
    throw new Error(`[${sheet.name}] en-têtes en double : ${headers.join(' | ')}`)
  const touched = new Set<string>()
  const filled = new Map<string, number>(headers.map(h => [h, 0]))
  const colOf = new Map<string, number>()
  for (const [col, label] of byCol) colOf.set(label, col)
  const dataRows: Row[] = rows.slice(headerIdx + 1).map(row => {
    for (const col of row.cells.keys()) {
      const header = byCol.get(col)
      if (header === undefined)
        throw new Error(`[${sheet.name}] ligne ${row.n} : cellule hors en-tête (colonne ${col})`)
      filled.set(header, (filled.get(header) ?? 0) + 1)
    }
    const column = (header: string): number => {
      const col = colOf.get(header)
      if (col === undefined)
        throw new Error(`[${sheet.name}] colonne inconnue « ${header} » (en-têtes : ${headers.join(' | ')})`)
      touched.add(header)
      return col
    }
    return {
      n: row.n,
      get: header => {
        const text = row.cells.get(column(header))
        return text === undefined ? undefined : clean(sheet.name, text)
      },
      link: header => row.links.get(column(header)),
    }
  })
  return {
    sheet: sheet.name,
    title: single(head[0]),
    subtitle: head[1] ? single(head[1]) : undefined,
    notes: head.slice(2).map(single),
    headers,
    rows: dataRows,
    touched,
    filled,
  }
}
