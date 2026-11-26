import { discoveryTitlesFor, type EsnTargetLevel } from '@bellum/contracts'

/**
 * #3754.3 — rapprochement de l'intitulé d'un contact avec les postes cibles de
 * l'ESN (`esn_target_personas`). Pur, sans I/O, AUCUN appel modèle.
 *
 * Normalisation : minuscules, accents retirés, ponctuation et « / » → espace,
 * alias FR/EN ramenés à un jeton commun (table courte {@link ROLE_ALIASES}),
 * mots vides retirés. Rapprochement : égalité normalisée d'abord, puis
 * inclusion de jetons (le poste cible tout entier est contenu dans l'intitulé),
 * sauf poste cible à un seul jeton (égalité seule) et intitulé d'adjoint (#3754.6).
 *
 * ⚠️ c58 / GA-06 : seul l'INTITULÉ entre ici — jamais l'identité, l'âge, le
 * genre, la photo, l'adresse.
 */

/** Alias, du plus long au plus court : une expression devient un jeton unique. */
const ROLE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['chief information security officer', 'ciso'],
  ['responsable securite des systemes d information', 'ciso'],
  ['responsable securite systemes d information', 'ciso'],
  ['rssi', 'ciso'],
  ['chief technology officer', 'cto'],
  ['directeur technique', 'cto'],
  ['directrice technique', 'cto'],
  ['chief information officer', 'cio'],
  ['directeur des systemes d information', 'cio'],
  ['directrice des systemes d information', 'cio'],
  ['directeur systemes d information', 'cio'],
  ['dsi', 'cio'],
  ['chief executive officer', 'ceo'],
  ['president directeur general', 'ceo'],
  ['directeur general', 'ceo'],
  ['directrice generale', 'ceo'],
  ['pdg', 'ceo'],
  ['chief financial officer', 'cfo'],
  ['directeur administratif et financier', 'cfo'],
  ['directeur financier', 'cfo'],
  ['directrice financiere', 'cfo'],
  ['daf', 'cfo'],
  ['chief operating officer', 'coo'],
  ['directeur des operations', 'coo'],
  ['chief digital officer', 'cdo'],
  ['directeur du digital', 'cdo'],
  ['directeur digital', 'cdo'],
  ['vice president', 'vp'],
  ['vice presidente', 'vp'],
  ['director', 'directeur'],
  ['directrice', 'directeur'],
  ['head of', 'responsable'],
  ['responsable de', 'responsable'],
]

/** Mots vides FR/EN — ne portent aucun sens de poste. */
const STOP_WORDS = new Set([
  'de',
  'des',
  'du',
  'la',
  'le',
  'les',
  'd',
  'l',
  'et',
  'and',
  'of',
  'the',
  'en',
  'au',
  'aux',
])

/**
 * Jetons trop vagues pour rapprocher SEULS par inclusion : un poste cible
 * « Directeur » ne doit pas attraper tous les directeurs (il ne rapproche que
 * par égalité).
 */
const GENERIC_TOKENS = new Set([
  'directeur',
  'responsable',
  'manager',
  'chef',
  'vp',
  'senior',
  'junior',
  'lead',
  'head',
])

/**
 * #3754.6 — qualificatifs de PÉRIMÈTRE : « DSI Group », « DSI France » désignent
 * le même poste que « DSI » ; ils sont retirés AU RAPPROCHEMENT seulement (la
 * clé stockée par {@link normalizeRoleTitle} ne change pas). Seuls groupe/group/
 * france : un « DSI Banque de détail » reste un autre périmètre, donc non rapproché.
 */
const SCOPE_WORDS = new Set(['groupe', 'group', 'france'])

/**
 * #3754.6 — un intitulé qualifié par ces jetons désigne l'ADJOINT du poste, pas
 * le poste : il ne prend JAMAIS le niveau du poste qu'il assiste, ni par égalité
 * ni par inclusion (sauf si le poste cible les porte lui-même).
 */
const DEPUTY_TOKENS = new Set(['adjoint', 'adjointe', 'assistant', 'assistante', 'deputy'])

/** Clé de rapprochement : la clé normalisée sans qualificatif de périmètre. */
function matchKeyOf(key: string): string {
  return key
    .split(' ')
    .filter(token => !SCOPE_WORDS.has(token))
    .join(' ')
}

/** Texte brut → jetons séparés par un espace, sans alias ni mots vides. */
function plain(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeRoleTitle(value: string): string {
  let text = ` ${plain(value)} `
  for (const [from, to] of ROLE_ALIASES) {
    text = text.split(` ${from} `).join(` ${to} `)
    // Deux alias adjacents partagent un espace : un second passage les rattrape.
    text = text.split(` ${from} `).join(` ${to} `)
  }
  return text
    .split(' ')
    .filter(token => token.length > 0 && !STOP_WORDS.has(token))
    .join(' ')
}

type PreparedTargetPersona = {
  key: string
  tokens: ReadonlySet<string>
  level: EsnTargetLevel
}

export type PreparedTargetPersonas = readonly PreparedTargetPersona[]

export function prepareTargetPersonas(
  personas: ReadonlyArray<{ title: string; decision_level: EsnTargetLevel | number }>,
): PreparedTargetPersonas {
  const out: PreparedTargetPersona[] = []
  for (const persona of personas) {
    const key = matchKeyOf(normalizeRoleTitle(persona.title))
    if (!key) continue
    const level = persona.decision_level
    if (level !== 1 && level !== 2 && level !== 3 && level !== 4) continue
    out.push({ key, tokens: new Set(key.split(' ')), level })
  }
  return out
}

/** Les morceaux d'un intitulé multiple : « CTO / Directeur Architecture ». */
function segmentsOf(title: string): string[] {
  return title
    .split(/[/|;]|\s[-–—]\s/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

/** Meilleur niveau (le plus décideur) d'UN texte déjà normalisé, ou `null`. */
function bestLevelOf(key: string, personas: PreparedTargetPersonas): EsnTargetLevel | null {
  if (!key) return null
  const tokens = new Set(key.split(' '))
  let exact: EsnTargetLevel | null = null
  let inclusion: { level: EsnTargetLevel; size: number } | null = null
  for (const persona of personas) {
    if (persona.key === key) {
      exact = exact === null || persona.level < exact ? persona.level : exact
      continue
    }
    // #3754.6 — par inclusion, un poste cible porte au moins un jeton DISCRIMINANT
    // (« Senior Manager » n'attrape pas tous les managers seniors).
    if ([...persona.tokens].every(token => GENERIC_TOKENS.has(token))) continue
    // #3754.6 — un poste cible à UN seul jeton (« cio », « cto ») ne rapproche que par
    // ÉGALITÉ : par inclusion il donnerait son niveau à « DSI Décisionnel… » ou
    // « Directeur Technique Collectives… » (10/10 « Niveau 1 » en démo).
    if (persona.tokens.size === 1) continue
    // Un adjoint / assistant n'hérite jamais du niveau du poste qu'il assiste.
    if ([...tokens].some(token => DEPUTY_TOKENS.has(token) && !persona.tokens.has(token))) continue
    if ([...persona.tokens].every(token => tokens.has(token))) {
      const size = persona.tokens.size
      if (!inclusion || size > inclusion.size || (size === inclusion.size && persona.level < inclusion.level)) {
        inclusion = { level: persona.level, size }
      }
    }
  }
  return exact ?? inclusion?.level ?? null
}

/**
 * #2533 (recette prod 07/10, UNEO) — « qui contacter à la DSI de X » : la
 * fonction DEMANDÉE est-elle portée par cet intitulé ? Même normalisation que
 * les postes cibles (alias FR/EN : « DSI » = « Directrice des Systèmes
 * d'information » = « CIO »), puis inclusion : chaque jeton de la demande est
 * dans l'intitulé. Un service (« la DSI ») attrape aussi ses membres (« Chef de
 * projet SI », « Responsable informatique »). Jamais un intitulé approchant
 * hors de ces règles : une fonction absente ne rapproche rien.
 */
const IT_DEPARTMENT_TOKENS = new Set(['cio', 'si', 'informatique'])

function titleMatchesFunctionLiteral(title: string, query: string): boolean {
  const wanted = matchKeyOf(normalizeRoleTitle(query))
  if (!wanted) return false
  const wantedTokens = wanted.split(' ')
  return [title, ...segmentsOf(title)].some(text => {
    const tokens = new Set(matchKeyOf(normalizeRoleTitle(text)).split(' '))
    if (wantedTokens.every(token => tokens.has(token))) return true
    // « la DSI » : le service entier, pas seulement son directeur.
    return wanted === 'cio' && [...IT_DEPARTMENT_TOKENS].some(token => tokens.has(token))
  })
}

export function titleMatchesFunction(title: string | null | undefined, query: string | null | undefined): boolean {
  if (!title || !query) return false
  if (titleMatchesFunctionLiteral(title, query)) return true
  // #4058 (recette R8a, 14/10) — « interlocuteurs cyber GRC de EDF » : la
  // fonction demandée est une EXPERTISE (« cyber », « GRC »), jamais un
  // intitulé de poste ; aucun alias ne la rapproche d'elle-même. Même
  // catalogue que la recherche externe (#4057/#4058, `discoveryTitlesFor`) :
  // un contact déjà en base sur cette expertise (RSSI, CISO…) doit être lu
  // AVANT toute recherche — jamais une expertise reconnue mais ignorée ici
  // simplement parce qu'elle n'est pas, en elle-même, un intitulé de poste.
  const expertiseTitles = discoveryTitlesFor({ expertise: query }) ?? []
  return expertiseTitles.some(candidate => titleMatchesFunctionLiteral(title, candidate))
}

/**
 * Le niveau que l'ESN donne à ce poste, ou `null` quand rien ne rapproche.
 * Un intitulé à plusieurs morceaux garde le meilleur niveau de ses morceaux.
 */
export function matchTargetLevel(
  title: string | null | undefined,
  personas: PreparedTargetPersonas,
): EsnTargetLevel | null {
  if (!title || personas.length === 0) return null
  const candidates = [title, ...segmentsOf(title)].map(text => matchKeyOf(normalizeRoleTitle(text)))
  let best: EsnTargetLevel | null = null
  for (const key of candidates) {
    const level = bestLevelOf(key, personas)
    if (level !== null && (best === null || level < best)) best = level
  }
  return best
}
