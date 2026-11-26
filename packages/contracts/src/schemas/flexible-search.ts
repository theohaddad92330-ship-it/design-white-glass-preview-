/**
 * #4400.1 (retour bêta ESN, 21/10/2026) — LA recherche texte souple du produit.
 *
 * « archi cyber » ne trouvait rien alors qu'« architecte cybersécurité » trouvait : la recherche
 * comparait une sous-chaîne exacte. Elle est désormais :
 *  (a) PRÉFIXE — « archi » trouve « architecte », « cyber » trouve « cybersécurité » ;
 *  (b) insensible à la casse, aux accents et au pluriel ;
 *  (c) étendue par un petit lexique d'abréviations du conseil IT (« dsi », « moa », « sysadmin »…) ;
 *  (d) en ET : TOUS les termes doivent matcher, chacun par préfixe ou par expansion.
 *
 * Une abréviation courte (≤ 3 lettres, ou « sap ») ne se prend JAMAIS en préfixe : « po » ne trouve pas
 * « poste », « sap » ne trouve pas « sapeur ». Un terme inconnu reste lui-même — jamais un synonyme deviné.
 *
 * UNE source : `fixtures/flexible-search.json` (lexique ET cas). Le miroir Python
 * (`apps/ia/app/services/flexible_search.py`) relit le même fichier dans ses tests ; ce module doit
 * rester égal à son lexique (`flexible-search.test.ts`).
 */

/** Terme tapé → ce qu'il désigne dans une offre ou un intitulé (accents conservés pour l'affichage). */
export const SEARCH_LEXICON: Readonly<Record<string, readonly string[]>> = {
  dev: ['développeur', 'développement', 'developer', 'programmeur'],
  archi: ['architecte', 'architecture', 'architect'],
  admin: ['administrateur', 'administration'],
  sysadmin: ['administrateur systèmes', 'administrateur système', 'sysadmin', 'sysops'],
  po: ['product owner', 'propriétaire produit'],
  pm: ['project manager', 'product manager', 'chef de projet'],
  cdp: ['chef de projet', 'responsable de projet'],
  rssi: ["responsable sécurité des systèmes d'information", 'responsable sécurité', 'ciso', 'rssi'],
  dsi: ["directeur des systèmes d'information", "directeur systèmes d'information", 'cio', 'dsi'],
  infra: ['infrastructure'],
  réseau: ['réseau', 'network'],
  rézo: ['réseau', 'network'],
  ops: ['operations', 'exploitation', 'devops', 'sysops'],
  devops: ['devops', 'sre', 'ops', 'intégration continue'],
  data: ['data', 'donnée'],
  bi: ['business intelligence', 'décisionnel'],
  qa: ['qualité', 'testeur', 'test', 'recette', 'quality assurance'],
  fullstack: ['full stack', 'fullstack'],
  front: ['front', 'frontend', 'front end'],
  back: ['back', 'backend', 'back end'],
  sap: ['sap', 'abap', 's4hana'],
  moa: ["maîtrise d'ouvrage", "assistance maîtrise d'ouvrage", 'moa', 'amoa'],
  amoa: ["assistance maîtrise d'ouvrage", "maîtrise d'ouvrage", 'amoa', 'moa'],
  moe: ["maîtrise d'œuvre", 'moe'],
  pmo: ['pmo', 'project management office', 'bureau des projets'],
  scrum: ['scrum', 'scrum master', 'agile'],
  cyber: ['cybersécurité', 'cybersecurity', 'sécurité informatique', 'ssi', 'sécurité', 'security'],
  sécu: ['sécurité', 'cybersécurité', 'sécurité informatique', 'ssi'],
  ssi: ['ssi', "sécurité des systèmes d'information", 'sécurité informatique', 'cybersécurité'],
}

/** Minuscules, sans accents, apostrophes en espace. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’ʼ`']/g, ' ')
}

/** Pluriel simple (« consultants » → « consultant ») : jamais sous quatre lettres. */
function singular(token: string): string {
  return token.length > 3 && /[sx]$/.test(token) ? token.slice(0, -1) : token
}

const TOKEN = /[a-z0-9+#]+(?:[./][a-z0-9+#]+)*/g

function tokens(value: string): string[] {
  return (fold(value).match(TOKEN) ?? []).map(singular)
}

const LEXICON_BY_TOKEN: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(SEARCH_LEXICON).map(([key, expansions]) => [tokens(key).join(' '), expansions]),
)

/** Les termes d'une requête, pliés. */
export function searchTokens(query: string): string[] {
  return tokens(query)
}

/** Un terme de plus de trois lettres, ou de trois lettres hors lexique, peut être un préfixe. */
function prefixAllowed(token: string): boolean {
  return token.length >= 4 || (token.length === 3 && !LEXICON_BY_TOKEN.has(token))
}

function matchesWord(candidate: string, word: string): boolean {
  return prefixAllowed(candidate) ? word.startsWith(candidate) : word === candidate
}

function containsPhrase(phrase: readonly string[], words: readonly string[]): boolean {
  if (phrase.length === 0) return false
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((candidate, offset) => matchesWord(candidate, words[start + offset] ?? ''))) return true
  }
  return false
}

/** Tous les termes de `query` matchent `haystack` (ET), chacun par préfixe ou par expansion. */
export function matchesFlexibleQuery(query: string, haystack: string): boolean {
  const wanted = tokens(query)
  if (wanted.length === 0) return false
  const words = tokens(haystack)
  return wanted.every(token => {
    if (containsPhrase([token], words)) return true
    return (LEXICON_BY_TOKEN.get(token) ?? []).some(expansion => containsPhrase(tokens(expansion), words))
  })
}

/** Ce que la recherche a essayé EN PLUS de ce qui était tapé — pour le dire dans l'état vide. */
export function explainFlexibleQuery(query: string): { tokens: string[]; expanded: string[] } {
  const wanted = tokens(query)
  const expanded: string[] = []
  for (const token of wanted) {
    for (const expansion of LEXICON_BY_TOKEN.get(token) ?? []) {
      const folded = tokens(expansion).join(' ')
      if (folded !== token && !expanded.includes(expansion)) expanded.push(expansion)
    }
  }
  return { tokens: wanted, expanded }
}
