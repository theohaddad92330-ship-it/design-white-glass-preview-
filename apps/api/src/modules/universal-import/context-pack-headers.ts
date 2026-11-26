import ExcelJS from 'exceljs'
import { readUniversalRecords } from './universal-import-parser'

/**
 * import-contexte Je.2 — les EN-TÊTES d'un fichier du pack de contexte, lus par le parser de l'import universel
 * (aucun parseur nouveau) ; pour un classeur, le nombre d'onglets en plus — le parser ne lit que le premier, et
 * un classeur à plusieurs onglets ne se classe pas sur sa seule première feuille.
 *
 * Tout échec de lecture rend `null` (jamais une exception) : le fichier part alors en connaissances, ce que
 * l'écran dit. ⚠️ Aucune cellule n'est journalisée.
 */
export async function readContextPackHeaders(
  extension: 'csv' | 'tsv' | 'xlsx',
  bytes: Buffer,
): Promise<{
  headers: string[] | null
  sheetCount: number | null
  sheets?: { name: string; headers: string[] }[]
}> {
  try {
    let sheetCount: number | null = null
    // #4426.4 — l'en-tête de CHAQUE onglet : le classement essaie chacun contre les règles.
    let sheets: { name: string; headers: string[] }[] | undefined
    if (extension === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer)
      sheetCount = workbook.worksheets.length
      sheets = workbook.worksheets.map(sheet => {
        let headers: string[] = []
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (headers.length > 0 || rowNumber > 50) return
          const cells: string[] = []
          for (let i = 1; i <= row.cellCount; i += 1) cells.push(row.getCell(i).text.trim())
          if (cells.some(Boolean)) headers = cells.filter(Boolean)
        })
        return { name: sheet.name, headers }
      })
    }
    async function* single(): AsyncGenerator<Buffer> {
      yield bytes
    }
    // La tabulation est détectée par le parser : un `.tsv` se lit comme un `csv`.
    for await (const event of readUniversalRecords(single(), extension === 'xlsx' ? 'xlsx' : 'csv')) {
      if (event.kind === 'headers') return { headers: event.headers, sheetCount, ...(sheets ? { sheets } : {}) }
    }
    return { headers: null, sheetCount, ...(sheets ? { sheets } : {}) }
  } catch {
    return { headers: null, sheetCount: null }
  }
}
