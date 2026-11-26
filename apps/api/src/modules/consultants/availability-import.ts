import { detectDelimiter, splitCsvLine } from '../contacts/csv-import'

/**
 * #2326.7/.9 (épopée #2794) — LECTURE d'un tableau de DISPONIBILITÉS de
 * consultants (nom/e-mail + date de disponibilité + taux), CSV ou XLSX.
 *
 * Même discipline que `csv-import.ts` (#2183.5) : une colonne non reconnue
 * est IGNORÉE, jamais devinée ; une ligne sans identité exploitable est
 * ÉCARTÉE avec sa raison. La différence de fond : ce fichier ne crée
 * personne — le RAPPROCHEMENT contre le vivier existant et l'ÉCRITURE sont
 * faits par l'appelant (`AvailabilityImportService`), jamais ici.
 *
 * `parseAvailabilityRows` est le cœur, indépendant du format d'entrée : le
 * CSV (`parseAvailabilityCsv`) et le XLSX (lu par le service, via `exceljs`,
 * déjà une dépendance du dépôt pour `document-builders.ts`) convergent tous
 * les deux vers un tableau de cellules avant de l'appeler — un seul endroit
 * qui sait lire une ligne de disponibilités (GA-26).
 */

export const AVAILABILITY_IMPORT_MAX_ROWS = 2000

type AvailabilityImportRow = {
  line: number
  fullName: string | null
  email: string | null
  /** `YYYY-MM-DD`, ou `null` si absent/non reconnu. */
  availableFrom: string | null
  /** TJM en euros, ou `null` si absent/non reconnu. */
  tjm: number | null
}

type AvailabilityImportRowSkip = {
  line: number
  reason: 'no_identity' | 'no_data' | 'malformed'
}

export type AvailabilityImportPreview = {
  rows: AvailabilityImportRow[]
  skipped: AvailabilityImportRowSkip[]
  mappedColumns: Record<string, string>
  ignoredColumns: string[]
  truncated: boolean
}

type AvailabilityColumnField = 'fullName' | 'email' | 'availableFrom' | 'tjm'

const COLUMN_ALIASES: Record<AvailabilityColumnField, string[]> = {
  fullName: ['full name', 'fullname', 'name', 'nom complet', 'nom et prénom', 'consultant', 'nom'],
  email: ['email', 'e-mail', 'email address', 'adresse email', 'courriel'],
  availableFrom: [
    'disponible le',
    'date de disponibilité',
    'date de disponibilite',
    'available from',
    'availability date',
    'date dispo',
    'dispo le',
    'disponibilite',
    'disponibilité',
  ],
  tjm: ['tjm', 'taux', 'taux journalier', 'daily rate', 'rate', 'tarif journalier', 'tarif', 'taux jour'],
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** En-tête → champ métier. `null` quand on ne reconnaît pas : on n'invente pas. */
export function mapAvailabilityColumn(header: string): AvailabilityColumnField | null {
  const normalized = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [AvailabilityColumnField, string[]][]) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) return field
  }
  return null
}

function cleanEmail(raw: string | null): string | null {
  if (!raw) return null
  const angled = /<([^>]+)>/.exec(raw)
  const candidate = (angled?.[1] ?? raw).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

/** `2026-09-27`, `27/09/2026` ou `27-09-2026` → `2026-09-27`. Toute autre
 *  forme (texte libre, date excel non convertie…) rend `null` — jamais une
 *  date devinée. */
export function parseAvailabilityDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) return isValidCalendarDate(iso[1]!, iso[2]!, iso[3]!) ? trimmed : null
  const european = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(trimmed)
  if (european) {
    const [, day, month, year] = european
    return isValidCalendarDate(year!, month!, day!) ? `${year}-${month}-${day}` : null
  }
  return null
}

function isValidCalendarDate(year: string, month: string, day: string): boolean {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Un TJM raisonnable, positif, entier — même borne que `consultantUpsertSchema`
 *  (`tjm.max(5000)`) : au-delà, la cellule est probablement autre chose (un
 *  montant annuel, une erreur de saisie), pas un TJM. */
export function parseAvailabilityRate(raw: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[€\s]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Math.round(Number(cleaned))
  return value > 0 && value <= 5000 ? value : null
}

/** Le cœur, partagé par le CSV et le XLSX : un tableau de cellules déjà
 *  découpé, en-têtes en première ligne. */
export function parseAvailabilityRows(cells: readonly (readonly string[])[]): AvailabilityImportPreview {
  if (!cells.length) {
    return { rows: [], skipped: [], mappedColumns: {}, ignoredColumns: [], truncated: false }
  }

  const headers = cells[0]!
  const mappedColumns: Record<string, string> = {}
  const ignoredColumns: string[] = []
  const fieldByIndex = new Map<number, AvailabilityColumnField>()

  headers.forEach((header, index) => {
    const field = mapAvailabilityColumn(header)
    if (field) {
      fieldByIndex.set(index, field)
      mappedColumns[header] = field
    } else if (header) {
      ignoredColumns.push(header)
    }
  })

  const dataRows = cells.slice(1)
  const truncated = dataRows.length > AVAILABILITY_IMPORT_MAX_ROWS
  const rows: AvailabilityImportRow[] = []
  const skipped: AvailabilityImportRowSkip[] = []

  dataRows.slice(0, AVAILABILITY_IMPORT_MAX_ROWS).forEach((cellsRow, offset) => {
    const line = offset + 2
    if (cellsRow.every(cell => !cell.trim())) {
      skipped.push({ line, reason: 'malformed' })
      return
    }
    const draft: Partial<Record<AvailabilityColumnField, string>> = {}
    fieldByIndex.forEach((field, index) => {
      const value = cellsRow[index]?.trim()
      if (value) draft[field] = value
    })

    const fullName = draft.fullName ?? null
    const email = cleanEmail(draft.email ?? null)
    if (!fullName && !email) {
      skipped.push({ line, reason: 'no_identity' })
      return
    }

    const availableFrom = parseAvailabilityDate(draft.availableFrom ?? null)
    const tjm = parseAvailabilityRate(draft.tjm ?? null)
    if (availableFrom === null && tjm === null) {
      skipped.push({ line, reason: 'no_data' })
      return
    }

    rows.push({ line, fullName, email, availableFrom, tjm })
  })

  return { rows, skipped, mappedColumns, ignoredColumns, truncated }
}

/** L'entrée CSV : découpe le texte en cellules, puis délègue au cœur commun. */
export function parseAvailabilityCsv(content: string): AvailabilityImportPreview {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], skipped: [], mappedColumns: {}, ignoredColumns: [], truncated: false }

  const delimiter = detectDelimiter(lines[0]!)
  const cells = lines.map(line => splitCsvLine(line, delimiter))
  return parseAvailabilityRows(cells)
}
