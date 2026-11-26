import { ZONE_COMMUNES, ZONE_DEPARTMENTS, ZONE_REGIONS } from './zone-referential.data'

/**
 * #4303 — suggestions de zone (ville, département, région) sur le référentiel STATIQUE INSEE
 * (`zone-referential.data.ts`). Aucune API : une zone qu'il ne connaît pas se DIT « non reconnue »
 * (#4303.2), elle ne devient jamais une recherche silencieuse sur un lieu inventé.
 */

const MIN_QUERY = 2
const MAX_SUGGESTIONS = 8

/** Casse, accents, tirets et apostrophes neutralisés : « saint etienne » trouve « Saint-Étienne ». */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim()
}

const REGION_LABEL = new Map(ZONE_REGIONS.map(([code, label]) => [code, label]))
const DEPARTMENT_CODES = new Set(ZONE_DEPARTMENTS.map(([code]) => code))
const COMMUNES = ZONE_COMMUNES.map(([insee, label, department]) => ({ insee, label, department, folded: fold(label) }))
const COMMUNE_NAMES = new Set(COMMUNES.map(c => c.folded))
const DEPARTMENTS = ZONE_DEPARTMENTS.map(([code, label, region]) => ({ code, label, region, folded: fold(label) }))
const REGIONS = ZONE_REGIONS.map(([code, label]) => ({
  code,
  label,
  folded: fold(label),
  codes: ZONE_DEPARTMENTS.filter(d => d[2] === code).map(d => d[0]),
}))

interface CommuneSuggestion {
  insee: string
  label: string
  department: string
  region: string
}

type DepartmentSuggestion =
  | { kind: 'department'; code: string; label: string; region: string; codes: string[] }
  | { kind: 'region'; code: string; label: string; region: string; codes: string[] }

/** Début du nom d'abord, puis le reste ; l'ordre du référentiel (alphabétique) départage. */
function rank<T extends { folded: string }>(items: readonly T[], query: string): T[] {
  const starts = items.filter(item => item.folded.startsWith(query))
  const contains = items.filter(item => !item.folded.startsWith(query) && item.folded.includes(query))
  return [...starts, ...contains]
}

export function suggestCommunes(raw: string): CommuneSuggestion[] {
  const query = fold(raw)
  if (query.length < MIN_QUERY) return []
  return rank(COMMUNES, query)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ insee, label, department }) => {
      const regionCode = ZONE_DEPARTMENTS.find(d => d[0] === department)?.[2] ?? ''
      return { insee, label, department, region: REGION_LABEL.get(regionCode) ?? '' }
    })
}

/** Le dernier élément d'une liste « 75, 92, rhô » : c'est lui qu'on complète. */
function lastToken(raw: string): string {
  return raw.split(/[,;]/).pop() ?? ''
}

export function suggestDepartments(raw: string): DepartmentSuggestion[] {
  const token = fold(lastToken(raw))
  if (token.length === 0) return []
  const byCode = /^\d/.test(token) || /^2[ab]$/.test(token)
  if (byCode) {
    return DEPARTMENTS.filter(d => d.code.toLowerCase().startsWith(token))
      .slice(0, MAX_SUGGESTIONS)
      .map(d => ({
        kind: 'department',
        code: d.code,
        label: d.label,
        region: REGION_LABEL.get(d.region) ?? '',
        codes: [d.code],
      }))
  }
  if (token.length < MIN_QUERY) return []
  const departments: DepartmentSuggestion[] = rank(DEPARTMENTS, token).map(d => ({
    kind: 'department',
    code: d.code,
    label: d.label,
    region: REGION_LABEL.get(d.region) ?? '',
    codes: [d.code],
  }))
  const regions: DepartmentSuggestion[] = rank(REGIONS, token).map(r => ({
    kind: 'region',
    code: r.code,
    label: r.label,
    region: r.label,
    codes: r.codes,
  }))
  return [...departments, ...regions].slice(0, MAX_SUGGESTIONS)
}

/** Choisir une suggestion remplace le dernier élément saisi et garde les précédents. */
export function withDepartmentSuggestion(raw: string, codes: readonly string[]): string {
  const previous = raw
    .split(/[,;]/)
    .slice(0, -1)
    .map(part => part.trim())
    .filter(Boolean)
  return [...previous, ...codes].join(', ')
}

/** #5002 — le libellé du référentiel d'une commune nommée exactement (casse/accents/tirets pliés), `null` sinon. */
export function communeLabel(raw: string): string | null {
  const folded = fold(raw)
  return COMMUNES.find(c => c.folded === folded)?.label ?? null
}

/** #4303.2 — vrai si la ville saisie n'est pas dans le référentiel. Un champ vide n'est pas une zone inventée. */
export function unrecognizedCity(raw: string): boolean {
  const folded = fold(raw)
  return folded.length > 0 && !COMMUNE_NAMES.has(folded)
}

/** #4303.2 — les éléments saisis qui ne sont pas un code de département connu (un nom se CHOISIT dans la liste). */
export function unrecognizedDepartments(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => {
      const padded = /^\d$/.test(token) ? `0${token}` : token.toUpperCase()
      return !DEPARTMENT_CODES.has(padded)
    })
}
