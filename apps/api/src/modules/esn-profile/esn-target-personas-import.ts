import { ESN_TARGET_PERSONAS_MAX_ROWS, type EsnTargetLevel, type EsnTargetPersonaRejectedRow } from '@bellum/contracts'
import { parseDelimited } from '../import/delimited-parser'

/**
 * #3754.1 — lecture d'un fichier de postes cibles (catégorie, intitulé, niveau
 * décideur). Pur, sans I/O : le service lit le classeur xlsx et lui passe des
 * cellules. Les en-têtes sont tolérants (FR/EN, accents, casse) ; une ligne
 * invalide est NOMMÉE (« ligne 12 : niveau absent »), jamais inventée.
 */

export type ParsedTargetPersona = { category: string | null; title: string; level: EsnTargetLevel }

export type ParsedTargetPersonas = {
  personas: ParsedTargetPersona[]
  rejected: EsnTargetPersonaRejectedRow[]
  /** Colonnes obligatoires non reconnues : le fichier est refusé en entier. */
  missingColumns: Array<'title' | 'level'>
  truncated: boolean
}

const plain = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const CATEGORY_HEADERS = new Set(['categorie', 'category', 'famille', 'family', 'domaine', 'domain', 'type', 'segment'])
const TITLE_HEADERS = new Set([
  'intitule',
  // #4426.5 — « Intitule_Poste » : le tiret bas, le tiret et l'espace se valent après normalisation.
  'intitule poste',
  'intitule du poste',
  'intitule de poste',
  'poste',
  'poste cible',
  'titre',
  'title',
  'job title',
  'jobtitle',
  'persona',
  'role',
  'fonction',
])
const LEVEL_HEADERS = new Set([
  'niveau decideur',
  'niveau decisionnaire',
  'niveau de decision',
  'niveau decision',
  'niveau',
  // #4426.5 — « Séniorité » : même échelle 1-4, lue par son chiffre.
  'seniorite',
  'level',
  'decision level',
  'decision maker level',
  'decideur',
  'decision',
])

function columnOf(headers: readonly string[], accepted: ReadonlySet<string>): string | null {
  return headers.find(header => accepted.has(plain(header))) ?? null
}

/** « 2 », « N2 », « niveau 3 », « 1 - signataire » → le premier chiffre 1-4 ; sinon `null`. */
function levelOf(raw: string): EsnTargetLevel | null {
  const match = /(?:^|[^0-9])([0-9]+)(?:[^0-9]|$)/.exec(raw.trim())
  const n = match ? Number(match[1]) : Number.NaN
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null
}

function parseRows(headers: string[], rows: Array<Record<string, string>>, truncated: boolean): ParsedTargetPersonas {
  const titleCol = columnOf(headers, TITLE_HEADERS)
  const levelCol = columnOf(headers, LEVEL_HEADERS)
  const categoryCol = columnOf(headers, CATEGORY_HEADERS)
  const missingColumns: Array<'title' | 'level'> = []
  if (!titleCol) missingColumns.push('title')
  if (!levelCol) missingColumns.push('level')
  if (missingColumns.length > 0 || !titleCol || !levelCol)
    return { personas: [], rejected: [], missingColumns, truncated }

  const personas: ParsedTargetPersona[] = []
  const rejected: EsnTargetPersonaRejectedRow[] = []
  rows.forEach((row, index) => {
    const line = index + 2
    const title = (row[titleCol] ?? '').trim()
    const rawLevel = (row[levelCol] ?? '').trim()
    const category = categoryCol ? (row[categoryCol] ?? '').trim() : ''
    if (!title && !rawLevel && !category) return // ligne vide : ni importée ni comptée
    if (!title) return void rejected.push({ line, reason: 'title_missing' })
    if (!rawLevel) return void rejected.push({ line, reason: 'level_missing' })
    const level = levelOf(rawLevel)
    if (level === null) return void rejected.push({ line, reason: 'level_invalid', value: rawLevel.slice(0, 80) })
    personas.push({ category: category || null, title, level })
  })
  return { personas, rejected, missingColumns, truncated }
}

export function parseTargetPersonasCsv(content: string): ParsedTargetPersonas {
  const file = parseDelimited(content, ESN_TARGET_PERSONAS_MAX_ROWS)
  return parseRows(file.headers, file.rows, file.truncated)
}

/** Cellules d'un classeur : la première ligne est l'en-tête. */
export function parseTargetPersonasCells(cells: ReadonlyArray<readonly string[]>): ParsedTargetPersonas {
  const [head, ...body] = cells
  if (!head) return { personas: [], rejected: [], missingColumns: ['title', 'level'], truncated: false }
  const headers = head.map(cell => cell.trim())
  const truncated = body.length > ESN_TARGET_PERSONAS_MAX_ROWS
  const rows = body.slice(0, ESN_TARGET_PERSONAS_MAX_ROWS).map(line => {
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = line[i] ?? ''
    })
    return row
  })
  return parseRows(headers, rows, truncated)
}
