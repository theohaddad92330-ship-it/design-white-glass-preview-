import type { ConsultantEntity } from '../../database/entities/consultant.entity'

/**
 * #4401.1 / #4402.2 (recette PROD 22/10) — une colonne JSON d'une fiche dont la FORME est inattendue
 * (CV importé partiel : objet là où on attend une liste, élément nul dans une liste) ne fait plus tomber
 * la fiche entière. La colonne illisible est ramenée à « absent » (liste vide, `null` pour les colonnes
 * nullables — jamais un 0 ni un texte inventé) ET NOMMÉE dans `unreadable`, pour que l'écran le dise.
 */
const STRING_LISTS = [
  'stack',
  'sectors',
  'zones',
  'references',
  'clearances',
] as const satisfies readonly (keyof ConsultantEntity)[]

const NULLABLE_STRING_LISTS = [
  'education',
  'environments',
  'tools',
  'certifications',
  'mobility_zones',
  'wanted_sectors',
  'refused_sectors',
  'refused_technologies',
  'wanted_contract_kinds',
  'preferred_client_types',
  'refused_clients',
  'environments_to_avoid',
  'interview_traits',
] as const satisfies readonly (keyof ConsultantEntity)[]

type Writable = Record<string, unknown>

/** Une liste de chaînes lisible, ou `null` si la forme ne l'est pas. Les éléments non textuels sont écartés et comptés comme illisibles. */
function readStrings(value: unknown): { list: string[]; clean: boolean } | null {
  if (!Array.isArray(value)) return null
  const list = value.filter((entry): entry is string => typeof entry === 'string')
  return { list, clean: list.length === value.length }
}

export function readableColumns(row: ConsultantEntity): { row: ConsultantEntity; unreadable: string[] } {
  const safe: Writable = { ...row }
  const unreadable: string[] = []

  for (const key of STRING_LISTS) {
    const raw = row[key] as unknown
    if (raw === null || raw === undefined) {
      safe[key] = []
      continue
    }
    const read = readStrings(raw)
    safe[key] = read?.list ?? []
    if (!read || !read.clean) unreadable.push(key)
  }

  for (const key of NULLABLE_STRING_LISTS) {
    const raw = row[key] as unknown
    if (raw === null || raw === undefined) continue
    const read = readStrings(raw)
    safe[key] = read?.list ?? null
    if (!read || !read.clean) unreadable.push(key)
  }

  const languages = row.languages as unknown
  if (languages !== null && languages !== undefined) {
    const valid = Array.isArray(languages)
      ? languages.filter(
          (entry): entry is { code: string; level: string | null } =>
            typeof entry === 'object' && entry !== null && typeof (entry as { code?: unknown }).code === 'string',
        )
      : null
    safe['languages'] = valid ?? []
    if (!valid || valid.length !== (languages as unknown[]).length) unreadable.push('languages')
  } else {
    safe['languages'] = []
  }

  const fieldReports = row.field_reports as unknown
  if (fieldReports !== null && fieldReports !== undefined && !Array.isArray(fieldReports)) {
    safe['field_reports'] = []
    unreadable.push('field_reports')
  }

  const extra = row.extra as unknown
  if (extra !== null && extra !== undefined) {
    if (typeof extra !== 'object' || Array.isArray(extra)) {
      safe['extra'] = {}
      unreadable.push('extra')
    } else {
      const entries = Object.entries(extra as Record<string, unknown>)
      const strings = entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      safe['extra'] = Object.fromEntries(strings)
      if (strings.length !== entries.length) unreadable.push('extra')
    }
  }

  return { row: safe as unknown as ConsultantEntity, unreadable }
}
