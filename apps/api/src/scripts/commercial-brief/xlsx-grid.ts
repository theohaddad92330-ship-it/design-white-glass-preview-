import AdmZip from 'adm-zip'
import ExcelJS from 'exceljs'

/**
 * Lecture d'un classeur de brief commercial en grilles de TEXTE (chantier
 * « briefs comptes », 01/10/2026).
 *
 * Trois pièges mesurés sur les cinq classeurs :
 *  - les cellules fusionnées (titres, « ce que ça veut dire ») répètent leur
 *    valeur sur chaque cellule de la fusion : on ne lit que la cellule maître ;
 *  - ALSTOM_ONESIDE_BRIEF porte un dessin (`xl/drawings/drawing1.xml`) sans
 *    préfixe de nom d'espace : `exceljs` plante à la réconciliation
 *    (`Cannot read properties of undefined (reading 'anchors')`). Les graphiques
 *    ne portent aucune donnée que les cellules n'aient déjà (la source des
 *    graphiques EST le bloc `Libellé | Valeur` du COCKPIT) : on les retire de
 *    l'archive avant de charger, pour les cinq classeurs, de façon identique ;
 *  - une valeur `[object Object]` est une sérialisation JavaScript ratée à
 *    l'export (TotalEnergies) : elle n'est pas une donnée, la cellule devient
 *    vide et le compte en est tenu (`GridSheet.badCells`), jamais effacé en
 *    silence.
 */

/** `links` : la cible d'un lien hypertexte (colonne LINKEDIN : le texte affiché
 *  est « Prénom NOM | LinkedIn », l'adresse est dans le lien). */
export type GridRow = { n: number; cells: Map<number, string>; links: Map<number, string> }
export type GridSheet = { name: string; rows: GridRow[]; badCells: number }
export type GridWorkbook = { created: Date; sheets: GridSheet[] }

const OBJECT_OBJECT = '[object Object]'

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>
    if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map(r => r.text).join('')
    if (typeof v.text === 'string') return v.text
    if (v.result !== undefined && v.result !== null) return String(v.result)
    if (typeof v.hyperlink === 'string') return v.hyperlink
    return ''
  }
  return String(value)
}

const withoutDrawings = (file: string): Buffer => {
  const zip = new AdmZip(file)
  for (const entry of zip.getEntries()) {
    const name = entry.entryName
    if (/^xl\/(drawings|charts)\//.test(name)) {
      zip.deleteFile(name)
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      zip.updateFile(
        entry,
        Buffer.from(
          entry
            .getData()
            .toString('utf8')
            .replace(/<drawing\b[^>]*\/>/g, ''),
        ),
      )
    } else if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(name)) {
      zip.updateFile(
        entry,
        Buffer.from(
          entry
            .getData()
            .toString('utf8')
            .replace(/<Relationship\b[^>]*relationships\/drawing"[^>]*\/>/g, ''),
        ),
      )
    }
  }
  return zip.toBuffer()
}

export const readWorkbook = async (file: string): Promise<GridWorkbook> => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(withoutDrawings(file) as unknown as ArrayBuffer)
  const sheets: GridSheet[] = []
  workbook.eachSheet(sheet => {
    const rows: GridRow[] = []
    let badCells = 0
    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      const cells = new Map<number, string>()
      const links = new Map<number, string>()
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (cell.isMerged && cell.master !== cell) return
        const text = cellText(cell.value).replace(/\r\n?/g, '\n').trim()
        if (text === OBJECT_OBJECT) {
          badCells += 1
          return
        }
        if (text) cells.set(col, text)
        const value = cell.value as unknown as Record<string, unknown> | null
        const link =
          typeof value === 'object' && value !== null && typeof value.hyperlink === 'string' ? value.hyperlink : ''
        if (link) links.set(col, link)
      })
      if (cells.size > 0) rows.push({ n, cells, links })
    })
    sheets.push({ name: sheet.name, rows, badCells })
  })
  return { created: workbook.created, sheets }
}
