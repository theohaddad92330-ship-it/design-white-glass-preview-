import type { PersonNameSearchHit, SearchPeopleByNameResult } from '@bellum/contracts'
import { normalizeFullName } from './contact-identity'

/**
 * #4386 — la recherche par nom d'un espace de DÉMONSTRATION (craft rule n°9).
 *
 * Avant : un homonyme FICTIF dérivé du nom tapé (« Theo H*** », « Responsable
 * Commercial », à l'entreprise tapée) — n'importe quel nom « existait ». Le lien
 * de démo est envoyé à des inconnus : il cherche désormais les personnes DU JEU
 * DE DÉMO déjà seedées dans l'espace, avec le même appariement que la cascade
 * réelle (`apps/ia/app/services/person_name_search.py`), et dit honnêtement
 * « personne » quand le nom n'y est pas. Aucun appel fournisseur.
 */

export interface DemoNameSearchRow {
  id: string
  full_name: string
  title: string | null
  linkedin_url: string | null
  location: string | null
  /** Le nom du compte porteur, quand le contact en a un. */
  company: string | null
}

// Miroir de `_ORG_SUFFIXES` / `_ORG_PREFIXES` (person_name_search.py) — les deux
// couches doivent dire la même chose de « la même entreprise ».
const ORG_SUFFIXES = new Set([
  'ai',
  'sas',
  'sasu',
  'sa',
  'sarl',
  'eurl',
  'se',
  'snc',
  'sci',
  'scop',
  'gie',
  'group',
  'groupe',
  'france',
  'com',
  'fr',
  'io',
  'net',
  'inc',
  'ltd',
  'llc',
  'gmbh',
])
const ORG_PREFIXES = new Set(['groupe', 'group', 'societe'])
const ORG_PREFIX_MIN_LEN = 4

function tokens(value: string | null | undefined): string[] {
  return normalizeFullName(value).split(' ').filter(Boolean)
}

function orgCore(org: string | null | undefined): string {
  let parts = tokens(org)
  while (parts.length > 1 && ORG_PREFIXES.has(parts[0]!)) parts = parts.slice(1)
  while (parts.length > 1 && ORG_SUFFIXES.has(parts[parts.length - 1]!)) parts = parts.slice(0, -1)
  return parts.join('')
}

/** « Bellum » ↔ « BELLUM AI » ↔ « BellumAI » ; jamais « Bellum » ↔ « Bel Air ». */
export function companiesCorrespond(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = orgCore(a)
  const cb = orgCore(b)
  if (!ca || !cb) return false
  if (ca === cb) return true
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  return short.length >= ORG_PREFIX_MIN_LEN && long.startsWith(short)
}

function nameMatches(query: string[], candidate: string[]): boolean {
  if (!candidate.length) return false
  const sortedQuery = [...query].sort().join(' ')
  if ([...candidate].sort().join(' ') === sortedQuery) return true
  if (query.length < 2) return false
  const pool = [...candidate]
  for (const token of query) {
    const at = pool.indexOf(token)
    if (at < 0) return false
    pool.splice(at, 1)
  }
  return true
}

export function searchDemoContactsByName(
  rows: readonly DemoNameSearchRow[],
  fullName: string,
  organizationName?: string,
): SearchPeopleByNameResult {
  const query = tokens(fullName)
  if (!query.length) return { hits: [], status: 'empty', sourcesQueried: [] }
  const org = organizationName?.trim() ?? ''

  const hits: PersonNameSearchHit[] = rows
    .filter(row => nameMatches(query, tokens(row.full_name)))
    .map(row => {
      const [firstName = '', ...rest] = row.full_name.trim().split(/\s+/)
      const companyOk = Boolean(org) && companiesCorrespond(org, row.company)
      const hit: PersonNameSearchHit = {
        id: `demo:${row.id}`,
        firstName,
        lastName: rest.join(' '),
        lastNameObfuscated: '',
        title: row.title ?? '',
        organizationName: row.company ?? '',
        city: row.location ?? '',
        country: '',
        hasEmail: false,
        hasPhone: false,
        sources: ['contact_base'],
        match: companyOk ? 'name_and_company' : 'name_only',
      }
      if (row.linkedin_url) hit.linkedinUrl = row.linkedin_url
      return hit
    })
    // Même rang que la cascade : nom ET entreprise d'abord, ordre stable sinon.
    .sort((a, b) => Number(a.match !== 'name_and_company') - Number(b.match !== 'name_and_company'))
    .slice(0, 20)

  return {
    hits,
    status: hits.length ? 'ok' : 'empty',
    sourcesQueried: [{ family: 'contact_base', outcome: hits.length ? 'found' : 'empty', count: hits.length }],
  }
}
