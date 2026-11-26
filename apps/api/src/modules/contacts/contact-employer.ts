/**
 * LUDB.5 — l'employeur d'un contact doit être CELUI du compte (ou de son groupe).
 * Miroir de `apps/ia/app/services/contact_employer.py` : l'IA refuse à
 * l'enrichissement, l'API rattrape les contacts DÉJÀ rattachés (on écarte, on
 * ne supprime pas). Une absence (pas d'e-mail, pas de domaine) ne rejette jamais.
 */

// LUDOVIC-D LC.2 — la décision vit dans `@bellum/contracts` (`homonym-decision.ts`) : les contacts,
// les actus et les angles lisent la MÊME, jamais une seconde.
export { accountDomainsFrom, isHomonymEmail, selectHomonymsToArchive } from '@bellum/contracts'

export const HOMONYM_EXCLUSION_REASON = 'homonyme : employeur hors du compte et de son groupe'

// #4928.4 — miroir de `name_matches_account` (apps/ia/app/services/search_hit_employer.py) pour les contacts DÉJÀ en base.
const NAME_SUFFIXES = new Set(
  (
    'sa sas sasu sarl eurl snc se spa gmbh ltd inc plc llc bv nv ag group groupe holding france europe international ' +
    'monde worldwide global paris idf belgique belgium suisse switzerland luxembourg espagne spain italie italy ' +
    'allemagne germany uk usa maroc tunisie afrique africa'
  ).split(' '),
)
const NAME_LEADING = new Set('mutuelle groupe group societe compagnie caisse association the la le les'.split(' '))

function nameWords(value: string | null | undefined): string[] {
  const text = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = text
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  while (words.length > 1 && NAME_LEADING.has(words[0])) words.shift()
  return words
}

/** Comparaison par MOTS entiers : « boulangerie » n'est pas « boulanger » + un reste ; « Boulanger SA » l'est. */
export function nameMatchesAccount(orgName: string | null | undefined, accountNames: readonly string[]): boolean {
  const org = nameWords(orgName)
  if (org.length === 0) return false
  return accountNames.some(name => {
    const target = nameWords(name)
    if (target.length === 0) return false
    if (org.length === target.length && org.every((word, i) => word === target[i])) return true
    return target.every((word, i) => org[i] === word) && org.slice(target.length).every(word => NAME_SUFFIXES.has(word))
  })
}
