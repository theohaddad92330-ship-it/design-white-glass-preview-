/**
 * #4399.5 — « prénom + nom » : ce qui a la forme d'une PERSONNE, à l'affichage. Lecture défensive, jumelle
 * conservatrice de `person-shaped-entity.ts` (API) : un faux positif ferait disparaître une vraie cible
 * commerciale, un faux négatif laisse une ligne de trop. On ne supprime rien en base ; on ne l'affiche pas.
 * Les noms ne sont jamais masqués ni tronqués ici — « Denis P. » reste « Denis P. ».
 */
const TITLE_START =
  /^(?:direct(?:eur|rice)s?|pr[ée]sident(?:e)?|vice[-\s]?pr[ée]sident(?:e)?|p-?dg|dg[ad]?|dsi|rssi|daf|drh|dpo|cto|cio|ceo|cfo|coo|cmo|cdo|ciso|vp|chief\b|head\s+of\b|responsable|chef\s+de\b|manager\b|g[ée]rant(?:e)?|administrat(?:eur|rice))/i

const ORG_WORDS = new Set([
  'groupe',
  'group',
  'holding',
  'sa',
  'se',
  'sas',
  'sasu',
  'sarl',
  'sci',
  'gie',
  'spa',
  'inc',
  'ltd',
  'llc',
  'gmbh',
  'corp',
  'company',
  'cie',
  'industries',
  'industrie',
  'technologies',
  'technologie',
  'solutions',
  'systems',
  'services',
  'service',
  'conseil',
  'consulting',
  'partners',
  'associates',
  'société',
  'societe',
  'association',
  'direction',
  'département',
  'departement',
  'agence',
  'banque',
  'assurance',
  'france',
  'international',
  'europe',
  'global',
  'digital',
  'projet',
  'équipe',
  'equipe',
  'team',
  'n/a',
])

const PARTICLES = new Set([
  'de',
  'du',
  'des',
  'le',
  'la',
  'les',
  'van',
  'von',
  'der',
  'den',
  'di',
  'da',
  'do',
  'dos',
  'el',
  'al',
  'bin',
  'ben',
  'mac',
  'mc',
  'saint',
  'sainte',
])

const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/

export function looksLikePersonName(raw: string | null | undefined): boolean {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 60 || /\d/.test(name) || name.includes(',')) return false
  if (TITLE_START.test(name)) return false
  const tokens = name.split(' ')
  if (tokens.length < 2 || tokens.length > 5) return false
  let capitalised = 0
  for (const token of tokens) {
    if (!NAME_TOKEN.test(token)) return false
    const lowered = token.toLowerCase().replace(/^['’.-]+|['’.-]+$/g, '')
    if (ORG_WORDS.has(lowered)) return false
    const first = token[0] ?? ''
    if (first !== first.toLowerCase()) capitalised += 1
    else if (!PARTICLES.has(lowered)) return false
  }
  return capitalised >= 2
}
