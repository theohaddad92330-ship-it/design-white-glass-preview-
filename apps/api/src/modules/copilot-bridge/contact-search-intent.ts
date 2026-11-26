/**
 * #4386.1 — « Trouve Théo Haddad chez Bellum » : Laura envoyait la phrase entière en `q`, et rien ne
 * contient « théo haddad chez bellum ». Ici la phrase se DÉCOUPE en nom + société, et la société perd ses
 * suffixes juridiques (« Bellum SAS » ↔ BELLUM). Miroir (fermé, écrit à la main) de `_ORG_SUFFIXES`
 * (apps/ia/app/services/person_name_search.py) : les deux couches disent la même chose d'une société.
 */
import { foldSearchTerm } from '../contacts/contact-name-search'

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
  'inc',
  'ltd',
  'llc',
  'gmbh',
])

const CHEZ = /^(.+?)\s+(?:chez|at|@)\s+(.+)$/i

/** « Bellum SAS » → « Bellum », « Groupe Bellum » garde son mot de tête (un seul mot ne se coupe jamais). */
export function cleanCompanyName(company: string): string {
  const words = company.split(/\s+/).filter(Boolean)
  while (words.length > 1 && ORG_SUFFIXES.has(foldSearchTerm(words[words.length - 1]!).replace(/[.,]/g, ''))) {
    words.pop()
  }
  return words.join(' ')
}

interface ContactSearchIntent {
  query?: string
  company?: string
}

/** Sépare « <nom> chez <société> » ; une société déjà donnée à part n'est jamais écrasée. */
export function parseContactSearchIntent(input: ContactSearchIntent): ContactSearchIntent {
  let { query, company } = input
  if (query && !company) {
    const m = CHEZ.exec(query)
    if (m) {
      query = m[1]!.trim()
      company = m[2]!.trim()
    }
  }
  return {
    ...(query ? { query } : {}),
    ...(company ? { company: cleanCompanyName(company) } : {}),
  }
}

/**
 * Repli quand « nom + société » collés (« haddad theo BELLUM SAS ») ne trouvent rien : les 1 ou 2 derniers
 * mots (hors suffixes juridiques) sont tentés comme société, le reste comme nom. Au plus deux essais.
 */
export function trailingCompanySplits(query: string): Array<Required<ContactSearchIntent>> {
  const words = cleanCompanyName(query).split(/\s+/).filter(Boolean)
  const splits: Array<Required<ContactSearchIntent>> = []
  for (const take of [1, 2]) {
    if (words.length - take < 2) continue
    splits.push({
      query: words.slice(0, words.length - take).join(' '),
      company: words.slice(words.length - take).join(' '),
    })
  }
  return splits
}
