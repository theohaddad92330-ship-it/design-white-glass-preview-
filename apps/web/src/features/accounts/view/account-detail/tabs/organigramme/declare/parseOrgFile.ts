import type { DeclareOrgPeopleRequest } from '@bellum/contracts'

/**
 * Lecture d'un fichier d'organigramme déposé par le commercial (#1103).
 *
 * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un […] »
 *
 * Fonction PURE, et deux temps comme l'assistant d'import : on rend ce qu'on a
 * COMPRIS — colonnes reconnues, colonnes ignorées, lignes écartées avec leur
 * raison — avant que rien ne soit envoyé. Ce qui n'a pas été reconnu est
 * NOMMÉ : une colonne devinée est une colonne qui écrira la mauvaise chose.
 *
 * Ce qu'on refuse plutôt que de deviner :
 *   · une colonne d'en-tête qu'on ne connaît pas — elle est listée, pas mappée ;
 *   · une ligne sans nom — un titre sans personne n'est pas une personne ;
 *   · un doublon dans le MÊME fichier — la seconde ligne est écartée avec sa
 *     raison, sinon deux lignes contradictoires partiraient et la dernière
 *     gagnerait en silence.
 */

type ParsedOrgRow = DeclareOrgPeopleRequest['people'][number]

export type OrgFileReading = {
  rows: ParsedOrgRow[]
  /** En-têtes reconnues, dans l'ordre du fichier. */
  recognised: string[]
  /** En-têtes qu'on ne sait pas lire — annoncées, jamais devinées. */
  ignored: string[]
  /** Lignes écartées : le numéro de ligne du FICHIER (en-tête comprise) et la raison. */
  skipped: Array<{ line: number; reason: 'no_name' | 'duplicate' }>
  /** Le fichier dépassait la borne : ce qui a été gardé est annoncé. */
  truncated: boolean
}

/** Borne annoncée, jamais une coupe en silence. Au-delà c'est un import de
 *  référentiel, qui passe par l'assistant d'import et sa simulation figée. */
export const ORG_FILE_MAX_ROWS = 200

/** En-têtes acceptées → champ. FR et EN, accents et casse neutralisés. */
const HEADERS: Record<string, keyof ParsedOrgRow> = {
  nom: 'fullName',
  'nom complet': 'fullName',
  'nom prenom': 'fullName',
  'prenom nom': 'fullName',
  personne: 'fullName',
  name: 'fullName',
  'full name': 'fullName',
  fonction: 'title',
  poste: 'title',
  intitule: 'title',
  titre: 'title',
  title: 'title',
  'job title': 'title',
  role: 'title',
  entite: 'entityName',
  direction: 'entityName',
  service: 'entityName',
  departement: 'entityName',
  bu: 'entityName',
  filiale: 'entityName',
  entity: 'entityName',
  department: 'entityName',
  division: 'entityName',
  manager: 'managerName',
  'n+1': 'managerName',
  responsable: 'managerName',
  'rattache a': 'managerName',
  'reports to': 'managerName',
  linkedin: 'linkedinUrl',
  'lien linkedin': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
}

function normaliseHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

function personKey(name: string): string {
  return normaliseHeader(name)
}

/**
 * Découpe une ligne CSV en respectant les guillemets.
 *
 * Le séparateur est choisi sur l'EN-TÊTE et appliqué à tout le fichier : un
 * Excel français écrit des points-virgules, et deviner ligne par ligne ferait
 * changer de découpage au milieu d'un fichier dont une cellule contient une
 * virgule.
 */
function splitLine(line: string, separator: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else quoted = false
      } else current += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === separator) {
      out.push(current)
      current = ''
    } else current += char
  }
  out.push(current)
  return out.map(cell => cell.trim())
}

function pickSeparator(header: string): string {
  // Le plus fréquent des deux gagne. À égalité — donc zéro des deux — le
  // point-virgule : c'est ce qu'écrit un Excel français, la source la plus
  // probable d'un organigramme envoyé par un client.
  return (header.match(/;/g) ?? []).length >= (header.match(/,/g) ?? []).length ? ';' : ','
}

/**
 * #2553.3 — porte la date du DOCUMENT (organigramme daté) sur chaque ligne
 * lue, avant l'envoi. « importer un organigramme qui a 3 ans, [que] les users
 * en ont conscience » : sans elle, la personne serait affirmée « aujourd'hui »
 * comme n'importe quelle saisie au formulaire, et un organigramme de 2023 ne
 * se distinguerait jamais d'une déclaration de ce matin.
 *
 * Facultative : `documentDate` vide laisse les lignes INCHANGÉES — c'est
 * l'ancien comportement, pour un fichier dont on ne connaît pas la date.
 */
export function withDocumentDate(rows: readonly ParsedOrgRow[], documentDate: string): ParsedOrgRow[] {
  if (!documentDate) return [...rows]
  return rows.map(row => ({ ...row, documentDate }))
}

export function parseOrgFile(text: string): OrgFileReading {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  const empty: OrgFileReading = { rows: [], recognised: [], ignored: [], skipped: [], truncated: false }
  if (lines.length === 0) return empty

  const separator = pickSeparator(lines[0]!)
  const headerCells = splitLine(lines[0]!, separator)
  const mapping = headerCells.map(cell => HEADERS[normaliseHeader(cell)])
  const recognised = headerCells.filter((_, i) => mapping[i])
  const ignored = headerCells.filter((cell, i) => !mapping[i] && cell.length > 0)
  // Sans colonne de nom, il n'y a rien à lire — et le dire vaut mieux que
  // rendre zéro ligne, qu'on lirait « mon fichier est vide ».
  if (!mapping.includes('fullName')) return { ...empty, ignored: headerCells.filter(Boolean) }

  const rows: ParsedOrgRow[] = []
  const skipped: OrgFileReading['skipped'] = []
  const seen = new Set<string>()
  let truncated = false

  for (let i = 1; i < lines.length; i += 1) {
    if (rows.length >= ORG_FILE_MAX_ROWS) {
      truncated = true
      break
    }
    const cells = splitLine(lines[i]!, separator)
    const row: Partial<ParsedOrgRow> = {}
    mapping.forEach((field, index) => {
      if (!field) return
      const value = (cells[index] ?? '').trim()
      if (value) row[field] = value
    })
    if (!row.fullName) {
      skipped.push({ line: i + 1, reason: 'no_name' })
      continue
    }
    const key = personKey(row.fullName)
    if (seen.has(key)) {
      // Deux lignes contradictoires partiraient et la dernière gagnerait en
      // silence : on garde la première et on DIT qu'on a écarté la seconde.
      skipped.push({ line: i + 1, reason: 'duplicate' })
      continue
    }
    seen.add(key)
    rows.push(row as ParsedOrgRow)
  }

  return { rows, recognised, ignored, skipped, truncated }
}
