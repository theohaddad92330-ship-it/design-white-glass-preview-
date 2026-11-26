/**
 * Parseur du compte SG complet (`data/sg-compte-complet.csv`, séparateur `;`).
 *
 * Pas de dépendance neuve (CSV_UNIQUE_PARSER_RULE, FINIR-V2-27-09 décision 3) :
 * une petite machine à états, tolérante aux champs entre guillemets qui
 * contiennent le séparateur, un guillemet échappé (`""`) ou un retour à la
 * ligne littéral — les trois cas RÉELLEMENT présents dans le fichier source.
 */

const DELIMITER = ';'
const QUOTE = '"'

/** Découpe un texte CSV en lignes de cellules brutes (RFC 4180, séparateur `;`). */
export function parseDelimitedText(raw: string): string[][] {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === QUOTE) {
        if (text[i + 1] === QUOTE) {
          field += QUOTE
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }
    if (char === QUOTE) {
      inQuotes = true
      i += 1
      continue
    }
    if (char === DELIMITER) {
      endField()
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      endRow()
      i += 1
      continue
    }
    field += char
    i += 1
  }
  // Dernière ligne sans retour final.
  if (field.length > 0 || row.length > 0) endRow()

  return rows.filter(cells => !(cells.length === 1 && cells[0] === ''))
}

/** Une ligne du CSV, indexée par en-tête. Cellule vide = absente (`undefined`),
 *  jamais une chaîne vide affichée comme une valeur. */
export type CompteCsvRow = Readonly<Record<string, string | undefined>>

export function parseCompteCsvRows(raw: string): CompteCsvRow[] {
  const [header, ...rest] = parseDelimitedText(raw)
  if (!header) return []
  return rest.map(cells => {
    const row: Record<string, string | undefined> = {}
    header.forEach((key, index) => {
      const value = cells[index]?.trim()
      row[key.trim()] = value ? value : undefined
    })
    return row
  })
}
