import { canonicalSkill } from '@bellum/contracts'
import { communeLabel } from '@/lib/zones/zone-suggest'
import { ZONE_DEPARTMENTS, ZONE_REGIONS } from '@/lib/zones/zone-referential.data'
import type { DiscoverSignal } from './discover-types'
import { REGISTRY_REGIONS } from './discover-registry-vocab'

/* ------------------------------------------------------------------ */
/*  #2165.60 — la phrase libre pose ce qu'elle PEUT dans le rail.       */
/*                                                                     */
/*  RÉFUTÉ en prod le 19/09 : « qui recrute des développeurs Java à     */
/*  Toulouse », tapé en mode Besoins, rendait 40 résultats hors sujet   */
/*  (plongeur, valet de chambre ; départements 26/16/05/38) — le rail   */
/*  restait VIDE et le message « Non pris en compte » listait TOUT,     */
/*  y compris « Toulouse ». Cause : le texte libre part TOUJOURS comme  */
/*  une recherche REGISTRE (`buildDiscoverRequest`, mode 'registry',    */
/*  `Discover.freetextSearch.test.tsx`), qui ne sait ni lire une nature */
/*  de signal ni resserrer sur des mots-clés d'intention — seule la     */
/*  ZONE (`city`) y a un sens, et la phrase ne la posait jamais.        */
/*                                                                     */
/*  Cette fonction est PURE : elle ne cherche rien, elle ne vérifie     */
/*  rien. Elle range ce qu'elle reconnaît dans des CONTRÔLES RÉELS du   */
/*  rail (nature de signal, ville) et laisse le RESTE — mots vides      */
/*  retirés — repartir en mots-clés (le contrôle « mode Signaux » du    */
/*  rail, `rail.keywordsLabel`) : rien n'est deviné, rien n'est perdu.  */
/*  Une phrase sans déclencheur reconnu rend `'any'` / `null`, jamais   */
/*  une valeur inventée (doctrine : non mesuré ≠ 0).                    */
/* ------------------------------------------------------------------ */

// ⚠️ Pas d'`export` : type consommé uniquement dans ce fichier
// (`pnpm lint:exports:types`, CLAUDE.md — jamais exporter un type qui ne
// sert qu'à lui-même).
interface ParsedNeedsFreetext {
  /** `'any'` si aucun mot déclencheur reconnu — aucune contrainte devinée. */
  nature: DiscoverSignal['type'] | 'any'
  /** La ville, quand la phrase la nomme avec « à <Ville> » en fin de
   *  proposition — le marqueur de lieu le plus courant en français. `null`
   *  sinon : jamais devinée d'un autre mot capitalisé. */
  city: string | null
  /** #4841 — le code de la RÉGION nommée en FIN de phrase (« talend en occitanie » → `76`). `null` quand la phrase
   *  n'en nomme aucune : la région n'est jamais devinée, et son mot ne part plus en mot-clé. */
  region: string | null
  /** #4841 — le code d'un DÉPARTEMENT dit par son nom (« dans le gard ») ou son code (« dans le 30 »). `null` sinon. */
  department: string | null
  /** Le reste de la phrase, mots vides retirés, posé en mots-clés. `null` si
   *  rien de substantiel ne reste. */
  keywords: string | null
  /** #4579.9 — le même reste, coupé aux « et » / « ou » / virgules : une liste, pas une chaîne collée. */
  keywordGroups: string[]
}

/** Les TROIS natures que le rail sait demander à la source — `legal`/`tech`
 *  sont rendus mais jamais demandables (`hasSignalOfNature`,
 *  `discover-presentation.ts`), donc jamais des déclencheurs ici. */
const NATURE_TRIGGERS: ReadonlyArray<{
  nature: Extract<DiscoverSignal['type'], 'hiring' | 'tender' | 'award'>
  words: readonly string[]
}> = [
  { nature: 'hiring', words: ['recrute', 'recrutent', 'recrutement', 'embauche', 'embauchent', 'embaucher'] },
  { nature: 'tender', words: ['appel d’offres', "appel d'offres", 'consultation', 'marché public', 'marches publics'] },
  { nature: 'award', words: ['attribué', 'attribue', 'remporté', 'remporte', 'lauréat', 'laureat'] },
]

/** Mots grammaticaux qui ne portent aucun critère — jamais posés en mots-clés. */
const STOPWORDS = new Set([
  'qui',
  'que',
  'des',
  'de',
  'du',
  'la',
  'le',
  'les',
  'un',
  'une',
  'dans',
  'en',
  'sur',
  'pour',
  'et',
  'ou',
  'avec',
  'chez',
  'à',
  'a',
  'au',
  'aux',
])

/**
 * « à <Ville> » en fin de phrase — le marqueur de lieu le plus courant en
 * français ; une ville à plusieurs mots (« Saint-Priest ») est prise entière.
 *
 * ⚠️ Pas de `\b` devant « à » : `\b` se définit sur `\w` (ASCII pur, même avec
 * le flag `u`), et « à » n'en fait pas partie — un « à » précédé d'une
 * espace ne serait alors JAMAIS reconnu comme un début de mot. `(?:^|\s)`
 * pose la même frontière explicitement, sans ce piège.
 */
const CITY_RE = /(?:^|\s)à\s+([A-ZÀ-Ý][\wÀ-ÿ'-]*(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'-]*)*)\s*$/u

/**
 * #4419.29 (Louis 24/10) — « dev vue à lille », « développeurs Vue.js près de Lille » : la ville tapée en minuscules,
 * ou après « près de » / « autour de » (et « a » sans accent), est une ville. Elle est lue en FIN de phrase seulement,
 * trois mots au plus, et jamais une modalité (« à distance », « à temps plein »).
 */
const LOOSE_CITY_RE =
  /(?:^|\s)(?:à|a|près de|pres de|autour de)\s+([\p{L}][\p{L}\p{M}'’.-]*(?:\s[\p{L}][\p{L}\p{M}'’.-]*){0,2})\s*$/iu
/**
 * Garde #5002 — communes dont le nom est AUSSI un mot courant FR/EN ou une marque connue : en fin de phrase SANS
 * marqueur (« Data Nice »), elles restent MOT-CLÉ et l'écran PROPOSE la zone. Liste courte, à cet endroit seulement.
 * Critère : mot courant (FR/EN) ou marque connue. Clés en minuscules sans accent.
 */
const AMBIGUOUS_CITIES = new Set(['nice', 'orange', 'tours', 'vienne', 'grasse', 'bourg', 'pau', 'lens', 'blois'])

const NOT_A_CITY = new Set(['distance', 'domicile', 'temps plein', 'temps partiel', 'plein temps', 'l’étranger'])

/** « villeneuve-d’ascq » → « Villeneuve-d’Ascq » : une ville tapée en minuscules reprend ses majuscules. */
function cityCase(raw: string): string {
  if (raw !== raw.toLocaleLowerCase()) return raw
  const upper = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1)
  return raw
    .split(/([\s-])/)
    .map(word => (/^[dl][’']/.test(word) ? word.slice(0, 2) + upper(word.slice(2)) : upper(word)))
    .join('')
}

const REGION_BY_NAME = new Map<string, string>([
  ...ZONE_REGIONS.map(([code, label]) => [foldZone(label), code] as [string, string]),
  ['idf', '11'],
  ['paca', '93'],
])
const DEPARTMENT_BY_NAME = new Map(ZONE_DEPARTMENTS.map(([code, label]) => [foldZone(label), code] as [string, string]))
const DEPARTMENT_CODES = new Set(ZONE_DEPARTMENTS.map(([code]) => code.toLocaleLowerCase()))

/**
 * #4841 — « en <région> », « dans le <département> », « dans le 30 », « département 30 » en FIN de phrase. Le marqueur
 * est obligatoire : un nom de zone nu (« talend occitanie ») ou un nombre nu (« java 11 », une version) ne pose rien.
 * Un lieu absent du référentiel ne matche pas : il reste en mots-clés, jamais jeté, jamais deviné.
 */
const ZONE_RE =
  /(?:^|\s)(?:en(?:\s+région)?|dans\s+(?:le|la|les|l['’])|dans|dept\.?|département|departement|région|region)\s*([\p{L}\d][\p{L}\p{M}\d'’-]*(?:\s[\p{L}\p{M}\d'’-]+){0,4})\s*$/iu

function readZone(rest: string): { region: string | null; department: string | null; index: number } | null {
  const match = ZONE_RE.exec(rest)
  if (!match) return null
  const tail = foldZone(match[1]!)
  const region = REGION_BY_NAME.get(tail)
  if (region) return { region, department: null, index: match.index }
  const byName = DEPARTMENT_BY_NAME.get(tail)
  if (byName) return { region: null, department: byName, index: match.index }
  // Un code nu n'est lu que derrière un marqueur de département : « dans le 30 », « département 30 ».
  if (/^\d{2,3}$|^2[ab]$/.test(tail) && DEPARTMENT_CODES.has(tail) && /dans|dept|d[ée]partement/i.test(match[0]))
    return { region: null, department: tail.toLocaleUpperCase(), index: match.index }
  return null
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** « Île-de-France » → « ile de france » : casse, accents, tirets et apostrophes pliés. */
function foldZone(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/['’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Les écritures courantes qui ne sont pas le libellé INSEE. */
const REGION_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['idf', '11'],
  ['paca', '93'],
  ['provence alpes cote d azur', '93'],
  ['la reunion', '04'],
  ['reunion', '04'],
]

const REGION_FOLDS: ReadonlyArray<readonly [string, string]> = [
  ...REGISTRY_REGIONS.map(region => [foldZone(region.label), region.code] as const),
  ...REGION_ALIASES,
].sort((a, b) => b[0].length - a[0].length)

/**
 * #4841 — « en occitanie », « dans la région Grand Est », « en Île-de-France » EN FIN de phrase : la région nommée
 * (libellé INSEE ou alias courant) devient un contrôle du rail. Sans « en » / « dans » devant, un nom de région nu
 * reste un mot-clé : « Bretagne » seul peut être autre chose qu'un lieu. `null` = aucune région reconnue.
 */
function regionAtEnd(text: string, bare = false): { code: string; start: number } | null {
  const folded = foldZone(text)
  for (const [label, code] of REGION_FOLDS) {
    // Lot 786 (#5203 B) — `bare` : la région NOMMÉE SEULE en fin de phrase (« SAP Île-de-France »), un mot avant
    // obligatoire (garde #5002 : « Bretagne » seul est peut-être autre chose qu'un lieu).
    const marker = bare ? '\\s' : '(?:^|\\s)(?:en|dans(?: la region| les| le| la)?|region)\\s+'
    const hit = new RegExp(`${marker}${label}$`, 'u').exec(folded)
    if (!hit) continue
    // `foldZone` ne change pas la longueur d'un texte NFC : la même position vaut dans le texte tapé.
    const lead = hit[0].length - hit[0].trimStart().length
    return { code, start: hit.index + lead }
  }
  return null
}

export function parseNeedsFreetext(freetext: string): ParsedNeedsFreetext {
  const trimmed = freetext.trim()
  if (!trimmed) return { nature: 'any', city: null, region: null, department: null, keywords: null, keywordGroups: [] }

  let nature: DiscoverSignal['type'] | 'any' = 'any'
  let rest = trimmed
  for (const trigger of NATURE_TRIGGERS) {
    const found = trigger.words.find(word => new RegExp(`(^|\\s)${escapeRegExp(word)}(\\s|$)`, 'iu').test(rest))
    if (found) {
      nature = trigger.nature
      rest = rest.replace(new RegExp(`(^|\\s)${escapeRegExp(found)}(\\s|$)`, 'iu'), ' ').trim()
      break
    }
  }

  // #4841 — la région d'abord (écritures longues : « dans la région Grand Est », alias), puis le département.
  let region: string | null = null
  let department: string | null = null
  const regionHit = regionAtEnd(rest) ?? (readZone(rest) ? null : regionAtEnd(rest, true))
  const zone = regionHit ? null : readZone(rest)
  if (regionHit) {
    region = regionHit.code
    rest = rest.slice(0, regionHit.start).trim()
  } else if (zone) {
    region = zone.region
    department = zone.department
    rest = rest.slice(0, zone.index).trim()
  }

  let city: string | null = null
  const hasZone = region !== null || department !== null
  const cityMatch = hasZone ? null : CITY_RE.exec(rest)
  const looseMatch = cityMatch || hasZone ? null : LOOSE_CITY_RE.exec(rest)
  if (cityMatch) {
    city = cityMatch[1]!.trim()
    rest = rest.slice(0, cityMatch.index).trim()
  } else if (looseMatch && !NOT_A_CITY.has(looseMatch[1]!.trim().toLocaleLowerCase())) {
    city = cityCase(looseMatch[1]!.trim())
    rest = rest.slice(0, looseMatch.index).trim()
  }

  // #5002 — « Data Strasbourg » : une commune du référentiel nommée SEULE en fin de phrase (sans « à ») est la zone.
  // Garde #4841 : un lieu absent du référentiel reste mot-clé ; garde #4842 : il faut un mot AVANT la ville
  // (« Strasbourg » seul est peut-être un nom), et la ville ne s'invente pas — elle est lue au référentiel.
  if (!city && !hasZone) {
    const words = rest.split(/\s+/)
    for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
      const label = communeLabel(words.slice(-take).join(' '))
      if (!label) continue
      if (AMBIGUOUS_CITIES.has(label.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))) continue
      city = label
      rest = words.slice(0, -take).join(' ')
      break
    }
  }

  const keywordTokens = rest.split(/\s+/).filter(token => token && !STOPWORDS.has(token.toLocaleLowerCase()))
  const keywords = keywordTokens.length > 0 ? keywordTokens.join(' ') : null

  // #4579.9 — « vue et java » = DEUX compétences : le « et » / « ou » / la virgule les sépare, ils ne se collent pas.
  const keywordGroups = rest
    .split(/\s+(?:et|ou|and|or)\s+|\s*[,;/+&]\s*/iu)
    .map(group =>
      group
        .split(/\s+/)
        .filter(token => token && !STOPWORDS.has(token.toLocaleLowerCase()))
        .join(' '),
    )
    .filter(Boolean)

  return { nature, city, region, department, keywords, keywordGroups }
}

/** Les mots qui disent un MÉTIER sans dire la compétence (« dev vue » cherche Vue). Clés en minuscules. */
const ROLE_WORDS = new Set([
  'dev',
  'devs',
  'développeur',
  'développeurs',
  'développeuse',
  'développeuses',
  'developpeur',
  'developpeurs',
  'developer',
  'developers',
])

/**
 * #4419.29 (Louis 24/10) — en mode Comptes, une phrase « compétence + lieu » (« dev vue à lille ») pose la
 * compétence ET la ville (#4841 : ou la région / le département) (100 km par défaut, #4641) au lieu de partir en texte libre : le service lisait la ville
 * mais jetait « vue », et la recherche rendait la ville entière. Rien n'est ajouté qui n'ait été tapé ; sans ville,
 * ou sans autre mot qu'un métier, ou une vraie phrase (« cabinets qui recrutent… », garde #4493), `null`.
 */
export function freetextSkillAndCity(
  freetext: string,
  zoneAlreadyRead = false,
): { skill: string; city: string | null; region: string | null; department: string | null } | null {
  const parsed = parseNeedsFreetext(freetext)
  // #4841 — « talend en occitanie », « java dans le gard » : une région ou un département nommé vaut une zone, comme la ville.
  // #4419.1 — `zoneAlreadyRead` : la zone a déjà été retirée de la phrase (`extractFreetextZone`), le reste est le besoin.
  const hasZone = Boolean(parsed.city || parsed.region || parsed.department) || zoneAlreadyRead
  if (!hasZone || !parsed.keywords || parsed.nature !== 'any') return null
  // #4579.9 — chaque groupe (coupé au « et » / « ou ») est UNE compétence : « dev vue et java » → « vue, java ».
  const skills = parsed.keywordGroups.map(group =>
    group
      .split(/\s+/)
      .filter(word => !ROLE_WORDS.has(word.toLocaleLowerCase()))
      .join(' '),
  )
  // Une compétence tient en deux mots (« Vue.js », « data engineer ») ; au-delà, c'est une phrase (#4493 : gardée).
  let kept = skills.filter(Boolean)
  // #4419.1 — un métier seul (« développeur à Lyon ») est le besoin : lu comme métier, jamais comme raison sociale.
  if (kept.length === 0) kept = parsed.keywordGroups.filter(Boolean)
  if (kept.length === 0 || kept.length > 3) return null
  if (kept.some(skill => skill.split(/\s+/).length > 2)) return null
  return { skill: kept.join(', '), city: parsed.city, region: parsed.region, department: parsed.department }
}

/**
 * #4841 — « talend en occitanie », « dev java dans le gard » : la zone dite dans la phrase est une ZONE du rail
 * (région ou département), pas un mot-clé. Avant, « en » était un mot vide et « occitanie » partait en mot-clé
 * pendant que le chip restait « Toute la France ».
 *
 * Marqueur obligatoire (« en », « dans », « au », « département », « dept ») + un nom que le référentiel PUBLIC
 * connaît (`frenchDepartments`), en FIN de phrase : « dev en java » ne pose rien. Un code seul (« dans le 30 »,
 * « département 30 ») est un département ; un nombre nu au milieu d'une phrase n'en est jamais un (« java 11 »
 * n'est pas l'Aude). Une phrase qui ne se réduit qu'à un code (« 30 ») est lue comme ce département.
 * Rien n'est deviné : sans nom reconnu, `region` et `department` restent `null` et la phrase repart intacte.
 */
interface FreetextZone {
  /** Code INSEE de la région (clé de `UnifiedFilters.region`), ou `null`. */
  region: string | null
  /** Code du département (« 30 », « 2A »), ou `null`. */
  department: string | null
  /** La phrase privée de sa zone — intacte quand aucune zone n'est lue. */
  rest: string
}

const ZONE_MARKER_RE = /(?:^|\s)(en|dans|au|département|departement|dept|dép\.?)\s+/giu
// #4945.2 — `les` AVANT `le` et `\s+` : « les Hauts-de-France » ne laisse plus « s Hauts-de-France ».
const ZONE_ARTICLE_RE = /^(?:(?:les|le|la)\s+région\s+|(?:les|le|la)\s+|l['’]\s*|région\s+|region\s+)/iu
const DEPARTMENT_CODE_RE = /^(?:\d{2}|2[ab])$/i

function zoneFromName(name: string, bareCodeAllowed: boolean): Pick<FreetextZone, 'region' | 'department'> | null {
  // Mêmes tables que `readZone` : un seul référentiel de zones pour les deux chemins (GA-26).
  const folded = foldZone(name)
  const region = REGION_BY_NAME.get(folded)
  if (region) return { region, department: null }
  if (bareCodeAllowed && DEPARTMENT_CODE_RE.test(name) && DEPARTMENT_CODES.has(folded)) {
    return { region: null, department: name.toLocaleUpperCase() }
  }
  const department = DEPARTMENT_BY_NAME.get(folded)
  return department ? { region: null, department } : null
}

export function extractFreetextZone(freetext: string): FreetextZone {
  const trimmed = freetext.trim()
  const none: FreetextZone = { region: null, department: null, rest: trimmed }
  if (!trimmed) return none
  if (DEPARTMENT_CODE_RE.test(trimmed)) {
    const alone = zoneFromName(trimmed, true)
    return alone ? { ...alone, rest: '' } : none
  }
  for (const marker of trimmed.matchAll(ZONE_MARKER_RE)) {
    const tail = trimmed.slice(marker.index + marker[0].length).trim()
    const zone = zoneFromName(tail.replace(ZONE_ARTICLE_RE, '').trim(), true)
    if (zone) return { ...zone, rest: trimmed.slice(0, marker.index).trim() }
  }
  return none
}

/** Ce qui suit « en » sans être un lieu : une modalité, un pays, un contrat. */
const NOT_A_PLACE_AFTER_EN = new Set(['france', 'télétravail', 'teletravail', 'remote', 'cdi', 'cdd', 'freelance'])

const BARE_COMMUNE_RE = /^\p{L}[\p{L}\p{M}]*-(?:sur|sous|en|lès|les)-\p{L}[\p{L}\p{M}-]*$/iu

const UNKNOWN_ZONE_RE =
  /(?:^|\s)(?:en(?:\s+région)?|dans\s+(?:les|le|la)\s+|dans\s+l['’]\s*|dans|dept\.?|département|departement|région|region)\b\s*([\p{L}][\p{L}\p{M}'’-]*(?:\s[\p{L}][\p{L}\p{M}'’-]*)?)\s*(?:$|[,;])/iu

/**
 * #4945.1 (reliquat #4841.6) — un marqueur de zone (« en », « dans le »…) est VU en fin de phrase, mais le lieu
 * derrière n'est pas au référentiel : il reste en mots-clés (rien n'est deviné), et l'écran DIT qu'il n'a pas servi de
 * zone. Rend le mot tel que tapé, `null` sinon. Jamais signalés : une zone reconnue, une ville (« à Lille »), un
 * nombre nu (« java 11 », décision #4841), une compétence derrière « en » (« dev en java »), une modalité.
 */
export function unrecognizedFreetextZone(freetext: string): string | null {
  const parsed = parseNeedsFreetext(freetext)
  if (parsed.region || parsed.department) return null
  // #4998.2 — « à Zorglub-sur-Mer » : une ville nommée que le référentiel ne connaît pas est DITE.
  if (parsed.city) return communeLabel(parsed.city) ? null : parsed.city
  // #4945.2 — une zone posée par `extractFreetextZone` (« dans les Hauts-de-France ») ne se contredit jamais ici.
  const read = extractFreetextZone(freetext)
  if (read.region || read.department) return null
  // #4998.2 — un seul mot de forme « X-sur-Mer » (commune typique) absent du référentiel : une zone, pas un nom.
  const bare = freetext.trim()
  if (BARE_COMMUNE_RE.test(bare) && !communeLabel(bare)) return bare
  // #4998.3 — la zone peut être suivie d'une virgule (« en Zorglub-sur-Mer, freelance Java »), plus seulement finale.
  const match = UNKNOWN_ZONE_RE.exec(bare)
  const word = match?.[1]?.trim()
  if (!word) return null
  if (NOT_A_PLACE_AFTER_EN.has(word.toLocaleLowerCase()) || canonicalSkill(word)) return null
  return word
}

const SIZE_PHRASE_RE =
  /(?:plus|moins)\s+de\s+\d[\d\s.]*\s*(?:personnes|salariés|salaries|employés|employes|collaborateurs|collaboratrices)/iu

/**
 * #4998.3 — « plus de 500 personnes » : la phrase ne pose AUCUNE tranche de taille (rien n'est deviné). On rend
 * l'expression telle que tapée pour que l'écran la DISE non lue et renvoie au filtre Taille ; `null` sans taille.
 */
export function unreadSizePhrase(freetext: string): string | null {
  return SIZE_PHRASE_RE.exec(freetext)?.[0].replace(/\s+/g, ' ').trim() ?? null
}

/**
 * Garde #5002 — « Data Nice » : la commune ambiguë en fin de phrase sans marqueur n'est pas devenue zone ; on rend son
 * libellé (au référentiel) pour que l'écran PROPOSE « Chercher à <Ville> ? ». `null` sinon — jamais devinée.
 */
export function ambiguousCitySuggestion(freetext: string): string | null {
  const parsed = parseNeedsFreetext(freetext)
  if (parsed.city || parsed.region || parsed.department) return null
  const words = freetext.trim().split(/\s+/)
  for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
    const label = communeLabel(words.slice(-take).join(' '))
    if (label && AMBIGUOUS_CITIES.has(label.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))) return label
  }
  return null
}
