/**
 * Lot 768 — LA recherche de /signals, UN seul module (GA-26) pour les deux onglets (Actuel et Historique).
 *
 * « power bi » trouve PowerBI et Power-BI ; « po » trouve Product Owner ; un besoin dont le TITRE porte la requête
 * passe devant celui qui ne l'a que dans le détail. Tout est client, sur ce qui est déjà chargé : aucune requête.
 *
 *  · normalisation : accents, casse, ponctuation, pluriels simples (un « s » final) ;
 *  · la requête est découpée en mots — TOUS doivent apparaître (dans un champ ou un autre) — ou en expression
 *    entre guillemets (mots contigus) ;
 *  · un petit dictionnaire de variantes métier ({@link VARIANT_GROUPS}) : un mot ou une expression de la requête
 *    cherche aussi ses équivalents ;
 *  · des champs pondérés (titre > compétences > détail > nom du compte), un bonus d'expression exacte, un léger
 *    bonus de récence. Le score ne sort jamais à l'écran : il ne sert qu'à ranger.
 */

/** Les poids par champ : le titre du besoin pèse plus que ses compétences, qui pèsent plus que le détail. */
const FIELD_WEIGHTS = { title: 10, skills: 6, detail: 3, account: 2 } as const
type FieldName = keyof typeof FIELD_WEIGHTS

/** Bonus quand TOUTE la requête (plusieurs mots) se lit d'un seul tenant dans le champ. */
const PHRASE_BONUS: Record<FieldName, number> = { title: 8, skills: 4, detail: 3, account: 2 }
/** Un début de mot (« pow » → « power ») compte moins qu'un mot entier. */
const PREFIX_FACTOR = 0.5
/** Au plus un point de récence : jamais de quoi passer devant un meilleur champ. */
const RECENCY_MAX = 1
const RECENCY_WINDOW_MS = 3 * 365 * 24 * 60 * 60 * 1000
const MIN_PREFIX_LENGTH = 3

/**
 * Les variantes métier, testées. Chaque ligne = des écritures équivalentes (normalisées : sans accent ni
 * ponctuation ; « power-bi » et « power bi » sont la même chose). Un acronyme ne se lit que MOT ENTIER.
 */
export const VARIANT_GROUPS: readonly (readonly string[])[] = [
  ['power bi', 'powerbi', 'pbi'],
  ['po', 'product owner'],
  ['pm', 'product manager'],
  ['scrum master', 'scrummaster'],
  ['devops', 'dev ops'],
  ['data engineer', 'data engineering', 'ingenieur data'],
  ['data analyst', 'analyste data'],
  ['data scientist'],
  ['ba', 'business analyst'],
  ['ml', 'machine learning'],
  ['fullstack', 'full stack'],
  ['frontend', 'front end'],
  ['backend', 'back end'],
  ['chef de projet', 'project manager'],
  ['amoa', 'maitrise d ouvrage'],
  ['dotnet', 'dot net'],
]

/**
 * Lot 769 — les technos qu'un INTITULÉ peut nommer (« Développeur Java senior H/F »), avec leur écriture affichée.
 * Lues comme MOT entier sur le texte normalisé (« Java » ne se lit pas dans « JavaScript ») ; une techno absente de
 * cette liste se lit encore dans les compétences de l'offre — rien n'est deviné.
 */
const TECH_TERMS: readonly string[] = [
  'Java',
  'JavaScript',
  'TypeScript',
  'Python',
  'React',
  'Angular',
  'Node',
  'PHP',
  'Symfony',
  'Spring',
  '.NET',
  'C#',
  'C++',
  'Golang',
  'Rust',
  'Kotlin',
  'SAP',
  'ServiceNow',
  'Power BI',
  'Talend',
  'Snowflake',
  'Databricks',
  'Spark',
  'Kafka',
  'SQL',
  'Oracle',
  'Docker',
  'Kubernetes',
  'Terraform',
  'Ansible',
  'AWS',
  'Azure',
  'GCP',
  'Linux',
  'Cobol',
]

/** Les écritures que la normalisation écraserait (« C# » → « c ») : on les lit AVANT, sous une clé sûre. */
const TECH_SYMBOLS: readonly (readonly [RegExp, string])[] = [
  [/\.net\b/gi, ' dotnet '],
  [/c#/gi, ' csharp '],
  [/c\+\+/gi, ' cpp '],
]
const TECH_KEYS: Readonly<Record<string, string>> = { '.NET': 'dotnet', 'C#': 'csharp', 'C++': 'cpp' }

const TECH_BY_WORDS = new Map<string, string>(
  TECH_TERMS.map(term => [TECH_KEYS[term] ?? normalizeSearchText(term), term]),
)

/** Les technos qu'un texte NOMME (mots entiers, ordre de lecture) — pour l'axe « Technos » de l'Historique. */
export function techTermsIn(text: string): string[] {
  const prepared = TECH_SYMBOLS.reduce((acc, [pattern, key]) => acc.replace(pattern, key), text)
  const padded = ` ${normalizeSearchText(prepared)} `
  return [...TECH_BY_WORDS.entries()]
    .map(([key, display]) => ({ display, at: padded.indexOf(` ${key} `) }))
    .filter(entry => entry.at !== -1)
    .sort((a, b) => a.at - b.at)
    .map(entry => entry.display)
}

/** Minuscules, sans accent ; tout ce qui n'est pas lettre ou chiffre devient UNE espace. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Le pluriel simple : « owners » = « owner ». Les mots courts ne bougent pas (« bus », « ios »). */
const singular = (word: string): string =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word

const tokensOf = (text: string): string[] => normalizeSearchText(text).split(' ').filter(Boolean).map(singular)

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const VARIANTS_BY_KEY: ReadonlyMap<string, readonly string[]> = new Map(
  VARIANT_GROUPS.flatMap(group => group.map(variant => [tokensOf(variant).join(''), group] as const)),
)

type Term = {
  /** Ce que l'utilisateur a tapé, normalisé (pour le détail des tests, jamais affiché). */
  label: string
  /** Mot entier / expression : séparateurs facultatifs entre les mots (« power bi » = PowerBI = Power-BI). */
  whole: RegExp
  /** Début de mot (dernier mot de l'expression), pour la saisie en cours. `null` = trop court. */
  prefix: RegExp | null
}

export type ParsedSearch = {
  terms: Term[]
  /** Plusieurs mots d'un tenant (même sans guillemets) : le bonus d'expression exacte. */
  phrase: RegExp | null
  /** La requête telle qu'elle a été lue (sans les guillemets) — pour la comparaison d'états. */
  raw: string
}

const FOLDED_BOUNDARY_BEFORE = '(?<![a-z0-9])'
const FOLDED_BOUNDARY_AFTER = '(?![a-z0-9])'

function regexOfTokens(tokens: readonly string[], mode: 'whole' | 'prefix'): RegExp {
  const body = tokens.map(escapeRegex).join('[^a-z0-9]*')
  // « s » final facultatif : « owner » trouve « owners » ; le mot continue ou non selon le mode.
  return mode === 'whole'
    ? new RegExp(`${FOLDED_BOUNDARY_BEFORE}${body}s?${FOLDED_BOUNDARY_AFTER}`)
    : new RegExp(`${FOLDED_BOUNDARY_BEFORE}${body}`)
}

function termOf(phraseTokens: readonly string[]): Term {
  const key = phraseTokens.join('')
  const group = VARIANTS_BY_KEY.get(key)
  const alternatives = group ? group.map(tokensOf) : [phraseTokens]
  const own = alternatives.some(tokens => tokens.join('') === key) ? alternatives : [...alternatives, phraseTokens]
  return {
    label: phraseTokens.join(' '),
    whole: new RegExp(own.map(tokens => regexOfTokens(tokens, 'whole').source).join('|')),
    prefix: key.length >= MIN_PREFIX_LENGTH ? regexOfTokens(phraseTokens, 'prefix') : null,
  }
}

/** Les termes de la requête : guillemets = une expression ; sinon un mot, sauf une variante de plusieurs mots (« power bi »). */
export function parseSearch(raw: string): ParsedSearch | null {
  const segments: Array<{ tokens: string[]; quoted: boolean }> = []
  for (const piece of raw.split(/("[^"]*")/)) {
    const quoted = piece.length > 1 && piece.startsWith('"') && piece.endsWith('"')
    const tokens = tokensOf(quoted ? piece.slice(1, -1) : piece)
    if (tokens.length > 0) segments.push({ tokens, quoted })
  }
  const terms: Term[] = []
  const allTokens: string[] = []
  for (const segment of segments) {
    allTokens.push(...segment.tokens)
    if (segment.quoted) {
      terms.push(termOf(segment.tokens))
      continue
    }
    for (let index = 0; index < segment.tokens.length;) {
      // La plus longue variante d'abord : « power bi » avant « power » puis « bi ».
      let size = Math.min(3, segment.tokens.length - index)
      while (size > 1 && !VARIANTS_BY_KEY.has(segment.tokens.slice(index, index + size).join(''))) size -= 1
      terms.push(termOf(segment.tokens.slice(index, index + size)))
      index += size
    }
  }
  if (terms.length === 0) return null
  return {
    terms,
    phrase: allTokens.length > 1 ? regexOfTokens(allTokens, 'whole') : null,
    raw: raw.trim(),
  }
}

export type SearchFields = {
  title: string
  skills: readonly string[]
  detail: string
  account: string
  /** La date du fait, pour le léger bonus de récence ; `null` = aucun bonus (jamais une date devinée). */
  dateMs: number | null
}

/** Le texte plié d'un champ, prêt à être lu par les motifs. */
const foldedField = (text: string): string => normalizeSearchText(text)

type SearchHit = { score: number }

/**
 * Le score d'un besoin pour une requête, ou `null` quand un mot n'apparaît nulle part. Somme pondérée des champs où
 * chaque mot se lit + bonus d'expression exacte + récence. Déterministe : mêmes entrées, même rang.
 */
export function scoreSearch(search: ParsedSearch, fields: SearchFields, nowMs: number = Date.now()): SearchHit | null {
  const folded: Record<FieldName, string> = {
    title: foldedField(fields.title),
    skills: foldedField(fields.skills.join(' ; ')),
    detail: foldedField(fields.detail),
    account: foldedField(fields.account),
  }
  let score = 0
  for (const term of search.terms) {
    let best = 0
    for (const name of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const text = folded[name]
      if (text === '') continue
      if (term.whole.test(text)) best += FIELD_WEIGHTS[name]
      else if (term.prefix?.test(text)) best += FIELD_WEIGHTS[name] * PREFIX_FACTOR
    }
    if (best === 0) return null
    score += best
  }
  if (search.phrase) {
    for (const name of Object.keys(PHRASE_BONUS) as FieldName[]) {
      if (search.phrase.test(folded[name])) score += PHRASE_BONUS[name]
    }
  }
  if (fields.dateMs !== null) {
    const age = Math.max(0, nowMs - fields.dateMs)
    score += RECENCY_MAX * Math.max(0, 1 - age / RECENCY_WINDOW_MS)
  }
  return { score }
}

/** Le texte plié ET, pour chaque caractère plié, sa position dans le texte d'origine (pour surligner l'original). */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = ''
  const origin: number[] = []
  let index = 0
  for (const char of text) {
    const plain = char
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
    for (const piece of plain) {
      folded += /[a-z0-9]/.test(piece) ? piece : ' '
      origin.push(index)
    }
    index += char.length
  }
  return { folded, origin }
}

type HighlightPart = { text: string; hit: boolean }

/** Découpe `text` en morceaux, ceux que la requête trouve portant `hit` (pour `<mark>`). Accents et casse d'origine conservés. */
export function highlightParts(text: string, search: ParsedSearch | null): HighlightPart[] {
  if (!search || text === '') return [{ text, hit: false }]
  const { folded, origin } = foldWithMap(text)
  const ranges: Array<[number, number]> = []
  for (const term of search.terms) {
    // Le surlignage lit ce que le score compte (lot 772) : le mot entier ET le début de mot.
    const source = term.prefix ? `${term.whole.source}|${term.prefix.source}` : term.whole.source
    const pattern = new RegExp(source, 'g')
    for (const match of folded.matchAll(pattern)) {
      if (match[0] === '') continue
      const start = origin[match.index]
      const lastFolded = match.index + match[0].length - 1
      const end = origin[lastFolded]! + 1
      if (start !== undefined) ranges.push([start, end])
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }]
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  const parts: HighlightPart[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
