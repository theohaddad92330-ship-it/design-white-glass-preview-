import { attribute, decodeXml, partText, readArchive, relationships, resolvePath } from './ooxml'

/**
 * #3803 (3803.2) — un classeur en GRILLE : ses onglets, dans l'ordre du
 * classeur, et pour chacun ses lignes (cellules creuses comblées par `''`,
 * pour que la colonne C reste sous l'en-tête C).
 */
export type SpreadsheetSheet = { name: string; rows: string[][] }

/** Garde-fous : un classeur de 8 Mo peut porter des centaines de milliers de cellules. */
const MAX_ROWS = 2_000
const MAX_COLUMNS = 100

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? ''
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** Les textes d'une `<si>` (chaîne partagée) — runs riches compris. */
function siText(fragment: string): string {
  let text = ''
  for (const match of fragment.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g))
    text += decodeXml(match[1] ?? '')
  return text
}

function sheetRows(xml: string, strings: readonly string[]): string[][] {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) break
    const rowNumber = Number(attribute(`<row${rowMatch[1] ?? ''}>`, 'r')) || rows.length + 1
    while (rows.length < rowNumber - 1 && rows.length < MAX_ROWS) rows.push([])
    const cells: string[] = []
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const open = `<c${cellMatch[1] ?? ''}>`
      const inner = cellMatch[2] ?? ''
      const reference = attribute(open, 'r')
      const column = reference ? columnIndex(reference) : cells.length
      if (column < 0 || column >= MAX_COLUMNS) continue
      const type = attribute(open, 't')
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value = ''
      if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = siText(inner)
      else if (type === 'b') value = raw === '1' ? 'VRAI' : 'FAUX'
      else value = raw !== undefined ? decodeXml(raw) : ''
      while (cells.length < column) cells.push('')
      cells[column] = value
    }
    rows.push(cells)
  }
  return rows
}

/** Lit un .xlsx : un onglet par feuille, dans l'ordre du classeur. */
export function parseXlsx(bytes: Uint8Array): SpreadsheetSheet[] {
  const archive = readArchive(bytes)
  const workbook = partText(archive, 'xl/workbook.xml') ?? ''
  const rels = relationships(partText(archive, 'xl/_rels/workbook.xml.rels'))
  const sharedXml = partText(archive, 'xl/sharedStrings.xml')
  const strings = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => siText(match[1] ?? '')) : []
  const sheets: SpreadsheetSheet[] = []
  for (const sheetMatch of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attribute(sheetMatch[0], 'name') ?? ''
    const relId = attribute(sheetMatch[0], 'r:id')
    const target = relId ? rels.get(relId) : undefined
    if (!target) continue
    const xml = partText(archive, resolvePath('xl', target))
    if (xml === null) continue
    sheets.push({ name, rows: sheetRows(xml, strings) })
  }
  return sheets
}

/**
 * Lit un .csv : séparateur deviné sur la première ligne (`;` d'un tableur
 * français, `,`, ou tabulation), guillemets RFC 4180 respectés.
 */
export function parseCsv(text: string): SpreadsheetSheet[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t'] as const
  const delimiter = candidates.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (rows.length >= MAX_ROWS) break
    } else cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return [{ name: '', rows }]
}
