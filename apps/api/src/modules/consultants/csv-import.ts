import { detectDelimiter, splitCsvLine } from '../contacts/csv-import'

/**
 * #2183.5 — import CSV d'un lot de consultants (« Format CSV/XLSX associé »).
 *
 * Même discipline que `contacts/csv-import.ts`, dont ce module réutilise le
 * découpage CSV (`splitCsvLine`/`detectDelimiter` — un seul endroit qui sait
 * lire un CSV français comme un CSV anglophone, GA-26) : une colonne qu'on ne
 * reconnaît pas est IGNORÉE, jamais devinée ; une ligne sans identité
 * exploitable est ÉCARTÉE avec sa raison ; la déduplication DANS le fichier
 * est annoncée. La déduplication CONTRE le vivier existant, elle, est faite
 * par l'appelant (`CvIntakeService.importCsv`), via `TalentIdentityService` —
 * la même matière que le dépôt de CV, pour ne jamais faire diverger deux
 * chemins de création de fiche.
 *
 * ⚠️ Le XLSX n'est volontairement PAS couvert ici — il demanderait une
 * dépendance de lecture binaire qu'aucun autre module du dépôt n'utilise
 * encore ; voir la ligne de registre 2183.5 pour la raison complète.
 */

/** Au-delà, ce n'est plus un lot de consultants : on refuse plutôt que de tronquer en silence. */
export const CONSULTANT_CSV_MAX_ROWS = 2000

type ImportedConsultantCsvRow = {
  /** Le numéro de ligne dans le fichier (en-tête = 1) — pour que l'appelant
   *  puisse rendre un rapport DANS L'ORDRE du fichier, lignes retenues et
   *  écartées mêlées, sans reconstituer la numérotation lui-même. */
  line: number
  fullName: string
  firstName: string | null
  lastName: string | null
  title: string | null
  email: string | null
  phone: string | null
}

type ConsultantCsvSkip = {
  line: number
  reason: 'no_identity' | 'no_name' | 'duplicate_in_file' | 'malformed'
}

type ConsultantCsvPreview = {
  consultants: ImportedConsultantCsvRow[]
  skipped: ConsultantCsvSkip[]
  /** Les en-têtes reconnus, et ceux qu'on a laissés de côté. */
  mappedColumns: Record<string, string>
  ignoredColumns: string[]
  truncated: boolean
}

/**
 * Les en-têtes qu'on sait reconnaître pour un consultant.
 *
 * Volontairement étroit : le lot #1116 (dépôt de CV en masse) demandait déjà
 * « Nom, prénom, téléphone, compétence » — les compétences ne sont PAS
 * couvertes ici (un terme par cellule, séparé par quoi ? aucun export mesuré
 * ne le dit) : les ajouter aurait deviné un format, pas reconnu un existant.
 */
/** Les champs qu'une colonne CSV peut alimenter — `line` est calculée par le
 *  parseur, jamais lue d'une cellule. */
type ConsultantCsvColumnField = Exclude<keyof ImportedConsultantCsvRow, 'line'>

const COLUMN_ALIASES: Record<ConsultantCsvColumnField, string[]> = {
  fullName: ['full name', 'fullname', 'name', 'nom complet', 'nom et prénom', 'consultant'],
  firstName: ['first name', 'firstname', 'prénom', 'prenom'],
  lastName: ['last name', 'lastname', 'nom', 'nom de famille'],
  title: ['title', 'job title', 'position', 'poste', 'fonction', 'intitulé', 'métier'],
  email: ['email', 'e-mail', 'email address', 'adresse email', 'courriel'],
  phone: ['phone', 'phone number', 'téléphone', 'telephone', 'tel', 'mobile', 'numéro'],
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
export function mapColumn(header: string): ConsultantCsvColumnField | null {
  const normalized = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [ConsultantCsvColumnField, string[]][]) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) return field
  }
  return null
}

/** `Jean Dupont <j@acme.com>` ou `j@acme.com` → `j@acme.com`, sinon `null`. */
function cleanEmail(raw: string | null): string | null {
  if (!raw) return null
  const angled = /<([^>]+)>/.exec(raw)
  const candidate = (angled?.[1] ?? raw).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

/**
 * Lit un fichier et rend ce qu'on a compris — sans jamais écrire.
 *
 * La séparation lecture/écriture est délibérée, même raison que
 * `parseContactCsv` : ce que le service d'ingestion fait de ce preview
 * (création, dédup contre le vivier) reste À L'APPELANT.
 */
export function parseConsultantCsv(content: string): ConsultantCsvPreview {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { consultants: [], skipped: [], mappedColumns: {}, ignoredColumns: [], truncated: false }
  }

  const delimiter = detectDelimiter(lines[0]!)
  const headers = splitCsvLine(lines[0]!, delimiter)
  const mappedColumns: Record<string, string> = {}
  const ignoredColumns: string[] = []
  const fieldByIndex = new Map<number, ConsultantCsvColumnField>()

  headers.forEach((header, index) => {
    const field = mapColumn(header)
    if (field) {
      fieldByIndex.set(index, field)
      mappedColumns[header] = field
    } else if (header) {
      ignoredColumns.push(header)
    }
  })

  const rows = lines.slice(1)
  const truncated = rows.length > CONSULTANT_CSV_MAX_ROWS
  const consultants: ImportedConsultantCsvRow[] = []
  const skipped: ConsultantCsvSkip[] = []
  const seen = new Set<string>()

  rows.slice(0, CONSULTANT_CSV_MAX_ROWS).forEach((row, offset) => {
    const line = offset + 2 // +1 pour l'en-tête, +1 pour compter à partir de 1
    const cells = splitCsvLine(row, delimiter)
    if (cells.every(cell => !cell)) {
      skipped.push({ line, reason: 'malformed' })
      return
    }

    const draft: Partial<Record<ConsultantCsvColumnField, string>> = {}
    fieldByIndex.forEach((field, index) => {
      const value = cells[index]
      if (value) draft[field] = value
    })

    const firstName = draft.firstName ?? null
    const lastName = draft.lastName ?? null
    const fullName = draft.fullName ?? [firstName, lastName].filter(Boolean).join(' ').trim()
    const email = cleanEmail(draft.email ?? null)
    const phone = draft.phone?.trim() || null

    // Une identité exploitable = un nom ou une adresse. Sans les deux, la
    // ligne ne désigne personne : on l'écarte et on le dit — jamais de fiche
    // « Inconnu » créée pour combler une ligne vide.
    if (!fullName && !email) {
      skipped.push({ line, reason: 'no_identity' })
      return
    }

    // #2732.2 — un e-mail seul ne désigne pas une FICHE nommée : la ligne est refusée avec son motif,
    // jamais créée sous son adresse (l'ancien repli `fullName || email` fabriquait un nom).
    if (!fullName) {
      skipped.push({ line, reason: 'no_name' })
      return
    }

    // Déduplication DANS le fichier : l'adresse d'abord (la plus fiable),
    // sinon le nom.
    const key = email ?? fullName.toLowerCase()
    if (seen.has(key)) {
      skipped.push({ line, reason: 'duplicate_in_file' })
      return
    }
    seen.add(key)

    consultants.push({
      line,
      fullName,
      firstName,
      lastName,
      title: draft.title ?? null,
      email,
      phone,
    })
  })

  return { consultants, skipped, mappedColumns, ignoredColumns, truncated }
}
