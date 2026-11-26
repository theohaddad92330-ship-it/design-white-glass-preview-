/**
 * Import d'un fichier de prospection exporté par l'utilisateur.
 *
 * Décision Louis du 03/08 : **pas de scraping LinkedIn**. L'étude ToS déjà au
 * dépôt conclut que c'est interdit et que ça fait bannir le compte de
 * l'utilisateur. La voie retenue est celle que les rapports décrivent d'ailleurs
 * eux-mêmes (« importe ce CSV Sales Navigator et déduplique les contacts ») :
 * l'utilisateur exporte depuis SA session, Bellum lit le fichier.
 *
 * Tout est pur et testé ici, pour une raison précise : un import silencieusement
 * faux ne se voit pas. Des colonnes mal devinées produisent trois cents contacts
 * dont le prénom est un intitulé de poste, et personne ne s'en aperçoit avant
 * d'envoyer les messages.
 *
 * Trois règles de fond :
 * - **une colonne qu'on ne reconnaît pas est ignorée, jamais devinée** ;
 * - **une ligne sans identité exploitable est écartée AVEC sa raison** ;
 * - **la déduplication est annoncée**, jamais silencieuse.
 */

import { writableContactName } from './contact-display-name'
import { refusePlaceholderEmail } from './placeholder-email'

/** Au-delà, ce n'est plus un fichier de prospection : on refuse plutôt que de tronquer en silence. */
export const MAX_IMPORT_ROWS = 2000

type ImportedContact = {
  fullName: string
  firstName: string | null
  lastName: string | null
  title: string | null
  email: string | null
  linkedinUrl: string | null
  companyName: string | null
}

type ImportSkip = {
  line: number
  reason: 'no_identity' | 'duplicate_in_file' | 'malformed'
}

type CsvImportPreview = {
  contacts: ImportedContact[]
  skipped: ImportSkip[]
  /** Les en-têtes reconnus, et ceux qu'on a laissés de côté. */
  mappedColumns: Record<string, string>
  ignoredColumns: string[]
  truncated: boolean
}

/**
 * Découpe une ligne CSV en respectant les guillemets.
 *
 * Écrit à la main plutôt qu'ajouté en dépendance : le besoin est un CSV
 * d'export, pas un dialecte exotique, et le code tient en vingt lignes que l'on
 * peut lire. Gère le séparateur virgule ET point-virgule, parce qu'un Excel
 * français exporte en point-virgule et que l'utilisateur ne le sait pas.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (inQuotes) {
      if (char === '"') {
        // `""` à l'intérieur d'un champ cité = un guillemet littéral.
        if (line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === delimiter) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells.map(cell => cell.trim())
}

/** Le séparateur le plus probable : celui qui découpe l'en-tête en le plus de colonnes. */
export function detectDelimiter(headerLine: string): string {
  // `;` d'abord : à égalité, l'export Excel français l'emporte (#4890).
  const candidates = [';', ',', '\t']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = splitCsvLine(headerLine, candidate).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * Les en-têtes qu'on sait reconnaître.
 *
 * Volontairement explicite : chaque forme listée a été vue dans un export réel
 * (Sales Navigator, Evaboot, exports CRM, Excel francophone). Une colonne
 * absente de cette table est IGNORÉE et listée comme telle — deviner « Company »
 * depuis « Comp. » produirait une donnée fausse que personne ne relirait.
 */
const COLUMN_ALIASES: Record<keyof ImportedContact, string[]> = {
  fullName: ['full name', 'fullname', 'name', 'nom complet', 'nom et prénom', 'contact'],
  firstName: ['first name', 'firstname', 'prénom', 'prenom'],
  lastName: ['last name', 'lastname', 'nom', 'nom de famille'],
  title: ['title', 'job title', 'position', 'poste', 'fonction', 'intitulé'],
  email: ['email', 'e-mail', 'email address', 'adresse email', 'courriel'],
  linkedinUrl: ['linkedin', 'linkedin url', 'profile url', 'profil linkedin', 'url du profil'],
  companyName: ['company', 'company name', 'société', 'societe', 'entreprise', 'account'],
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
export function mapColumn(header: string): keyof ImportedContact | null {
  const normalized = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ImportedContact, string[]][]) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) return field
  }
  return null
}

/** `Jean Dupont <j@acme.com>` ou `j@acme.com` → `j@acme.com`, sinon `null`. */
function cleanEmail(raw: string | null): string | null {
  if (!raw) return null
  const angled = /<([^>]+)>/.exec(raw)
  const candidate = (angled?.[1] ?? raw).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null
  // #4599.2 — un gabarit (`prenom.nom@…`) n'est l'adresse de personne : la ligne reste, sans adresse.
  return refusePlaceholderEmail(candidate).email
}

/** Une URL LinkedIn normalisée (sans paramètres ni barre finale), sinon `null`. */
function cleanLinkedin(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!/linkedin\.com\/in\//i.test(trimmed)) return null
  return trimmed.split('?')[0]!.replace(/\/+$/, '').toLowerCase()
}

/**
 * Lit un fichier et rend ce qu'on a compris — sans jamais écrire.
 *
 * La séparation lecture/écriture est délibérée : l'écran montre CE preview,
 * l'utilisateur confirme, et seulement alors l'import écrit. Un import qui
 * commence par écrire ne laisse aucune place au « ah non, ce n'est pas la bonne
 * colonne ».
 */
export function parseContactCsv(content: string): CsvImportPreview {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { contacts: [], skipped: [], mappedColumns: {}, ignoredColumns: [], truncated: false }
  }

  const delimiter = detectDelimiter(lines[0]!)
  const headers = splitCsvLine(lines[0]!, delimiter)
  const mappedColumns: Record<string, string> = {}
  const ignoredColumns: string[] = []
  const fieldByIndex = new Map<number, keyof ImportedContact>()

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
  const truncated = rows.length > MAX_IMPORT_ROWS
  const contacts: ImportedContact[] = []
  const skipped: ImportSkip[] = []
  const seen = new Set<string>()

  rows.slice(0, MAX_IMPORT_ROWS).forEach((row, offset) => {
    const line = offset + 2 // +1 pour l'en-tête, +1 pour compter à partir de 1
    const cells = splitCsvLine(row, delimiter)
    if (cells.every(cell => !cell)) {
      skipped.push({ line, reason: 'malformed' })
      return
    }

    const draft: Partial<Record<keyof ImportedContact, string>> = {}
    fieldByIndex.forEach((field, index) => {
      const value = cells[index]
      if (value) draft[field] = value
    })

    const firstName = draft.firstName ?? null
    const lastName = draft.lastName ?? null
    const fullName = draft.fullName ?? [firstName, lastName].filter(Boolean).join(' ').trim()
    const email = cleanEmail(draft.email ?? null)
    const linkedinUrl = cleanLinkedin(draft.linkedinUrl ?? null)

    // Une identité exploitable = un nom, une adresse, ou un profil. Sans aucun
    // des trois, la ligne ne désigne personne : on l'écarte et on le dit.
    if (!fullName && !email && !linkedinUrl) {
      skipped.push({ line, reason: 'no_identity' })
      return
    }

    // Déduplication dans le FICHIER : l'adresse d'abord (la plus fiable), sinon
    // le profil, sinon le nom + société.
    const key = email ?? linkedinUrl ?? `${fullName.toLowerCase()}|${(draft.companyName ?? '').toLowerCase()}`
    if (seen.has(key)) {
      skipped.push({ line, reason: 'duplicate_in_file' })
      return
    }
    seen.add(key)

    contacts.push({
      // #4586 — jamais l'adresse (ni l'URL du profil) pour nom : la partie locale lisible, sinon « à compléter ».
      fullName: writableContactName(fullName, email).name,
      firstName,
      lastName,
      title: draft.title ?? null,
      email,
      linkedinUrl,
      companyName: draft.companyName ?? null,
    })
  })

  return { contacts, skipped, mappedColumns, ignoredColumns, truncated }
}
