import type {
  AnalysisProfileData,
  CompanySuggestion,
  SimilarityConfidence,
  SimilarityReason,
  SimilaritySharedCriterion,
} from '@bellum/contracts'
import { FRENCH_REGION_DEPARTMENTS, SIMILARITY_AXES_REQUIRED, SIMILARITY_SHARED_CRITERIA } from '@bellum/contracts'

/**
 * Hybrid scoring for "comptes similaires à explorer" (retour Théo, addendum
 * p.5/18). The NAF-filtered discovery stays the SEED (same-registry-sector
 * candidates only); this module re-ranks those candidates against the seller's
 * server-side profile ({@link AnalysisProfileData}, resolved by
 * `EsnProfileReader` — the front never sends it).
 *
 * Design constraints:
 *  - 100% deterministic — plain string/number matching, NO LLM call.
 *  - No invented data — a criterion whose input is missing on EITHER side
 *    (candidate or profile) contributes exactly 0; candidates are never
 *    penalised for missing registry data, only rewarded for confirmed fit.
 *  - Stable — ties keep the discovery order (Pappers relevance), so an empty
 *    profile yields the exact pre-scoring ranking.
 */

/* ------------------------------------------------------------------ */
/*  Weights — the whole tuning surface, in one place.                  */
/* ------------------------------------------------------------------ */

/** Poids secteur : un mot-clé des secteurs CIBLES du profil vendeur retrouvé
 *  dans le libellé d'activité du candidat. Critère le plus fort — c'est la
 *  définition même de « compte à conquérir » pour ce vendeur. */
const WEIGHT_SECTOR = 3

/** Poids géographie : le candidat est dans une des zones du profil (ville
 *  citée, ou département du siège → région correspondante). */
const WEIGHT_GEO = 2

/** Poids taille : la tranche d'effectifs registre du candidat recoupe un des
 *  types d'entreprises ciblés du profil (PME/ETI/grands comptes). */
const WEIGHT_SIZE = 2

/** Maximum reachable raw score — used to normalise `score_similarity` (0..1). */
export const SIMILAR_SCORE_MAX = WEIGHT_SECTOR + WEIGHT_GEO + WEIGHT_SIZE

/* ------------------------------------------------------------------ */
/*  Normalisation helpers                                              */
/* ------------------------------------------------------------------ */

/** Lowercase, strip accents, collapse everything non-alphanumeric to spaces. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean)
}

/** Generic filler words from the onboarding option labels — never a sector
 *  signal on their own ("Services financiers", "Grande distribution"…). */
const SECTOR_STOPWORDS = new Set(['services', 'service', 'grande', 'grands', 'grand', 'secteur', 'autres', 'marches'])

/* ------------------------------------------------------------------ */
/*  Critère 1 — secteurs cibles du profil (mots-clés)                  */
/* ------------------------------------------------------------------ */

/** True when any meaningful keyword of the seller's target sectors appears in
 *  the candidate's activity text (NAF label + discovery seed token). Prefix
 *  match both ways (≥ 4 chars) so « assurance » ↔ « assurances » match.
 *
 *  Exportée : c'est le même appariement que Découvrir applique désormais comme
 *  FILTRE par défaut (#2489.3/D1, port exact côté IA dans
 *  `apps/ia/app/services/discover_scoring.py::sector_matches_profile_targets`)
 *  — réutilisée telle quelle par la salle de démonstration
 *  (`demo-scripts.ts::demoDiscoverResponse`) pour que la démo honore la MÊME
 *  règle que le vrai chemin plutôt que d'en recopier une troisième (GA-26). */
export function matchesTargetSectors(candidateSectorText: string, profileSectors: readonly string[]): boolean {
  const candidateTokens = tokens(candidateSectorText)
  if (candidateTokens.length === 0) return false
  const profileTokens = profileSectors
    .flatMap(tokens)
    .filter(token => token.length >= 4 && !SECTOR_STOPWORDS.has(token))
  return profileTokens.some(profileToken =>
    candidateTokens.some(
      candidateToken =>
        candidateToken.length >= 4 &&
        (candidateToken.startsWith(profileToken) || profileToken.startsWith(candidateToken)),
    ),
  )
}

/* ------------------------------------------------------------------ */
/*  Critère 2 — géographie (dept/région du siège vs zones du profil)   */
/* ------------------------------------------------------------------ */

/** Région administrative par département (métropole). Sert à faire matcher un
 *  code postal Pappers (« 92500 » → dept 92 → Île-de-France) contre les zones
 *  du questionnaire (« Paris & Île-de-France »). Table factuelle, stable. */
// #4286.15.c — la table vit désormais dans le contrat (`FRENCH_REGION_DEPARTMENTS`, GA-26), lue aussi par
// les tendances de marché ; le jeton (`ile_de_france`) se replie ici en nom plié (`ile de france`).
const REGION_DEPARTMENTS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(FRENCH_REGION_DEPARTMENTS).map(([region, departments]) => [region.replace(/_/g, ' '), departments]),
)

/** Alias supplémentaires rencontrés dans les libellés de zones (« PACA »). */
const REGION_ALIASES: Record<string, string> = {
  paca: 'provence alpes cote d azur',
  idf: 'ile de france',
}

/** Dept from a French postal code — '92500' → '92' (Corse stays '20'). */
function departmentFromPostalCode(postalCode: string): string | null {
  const digits = postalCode.replace(/\D/g, '')
  if (digits.length < 2) return null
  // DOM (971xx-976xx) use 3-digit departments.
  return digits.startsWith('97') || digits.startsWith('98') ? digits.slice(0, 3) : digits.slice(0, 2)
}

/** Zones that express NO geographic restriction — when the seller targets the
 *  whole country (or remote/international), geography cannot discriminate
 *  between two candidates, so the criterion is skipped entirely. */
function isRestrictiveZone(zone: string): boolean {
  const normalized = normalize(zone)
  return !['national', 'international', 'remote', 'toute la france', 'monde'].some(open => normalized.includes(open))
}

/** True when the candidate's HQ (city and/or dept-derived region) belongs to
 *  one of the seller's RESTRICTIVE geo zones. */
function matchesGeoZones(
  candidate: { city?: string | null; postal_code?: string | null },
  zones: readonly string[],
): boolean {
  const restrictive = zones.filter(isRestrictiveZone).map(normalize)
  if (restrictive.length === 0) return false

  // Ville citée telle quelle dans la zone (« Lyon & Auvergne-Rhône-Alpes ») —
  // match sur frontière de mot pour éviter les faux positifs par sous-chaîne.
  const city = candidate.city ? normalize(candidate.city) : ''
  if (city.length >= 3 && restrictive.some(zone => ` ${zone} `.includes(` ${city} `))) {
    return true
  }

  // Département du code postal → région → nom de région présent dans la zone.
  const department = candidate.postal_code ? departmentFromPostalCode(candidate.postal_code) : null
  if (!department) return false
  const region = Object.entries(REGION_DEPARTMENTS).find(([, departments]) => departments.includes(department))?.[0]
  if (!region) return false
  return restrictive.some(zone => {
    const canonical = Object.entries(REGION_ALIASES).reduce(
      (text, [alias, target]) => (text.includes(alias) ? `${text} ${target}` : text),
      zone,
    )
    return canonical.includes(region)
  })
}

/* ------------------------------------------------------------------ */
/*  Critère 3 — taille (effectifs registre vs types d'entreprise cibles)*/
/* ------------------------------------------------------------------ */

type HeadcountRange = { min: number; max: number }

/**
 * Headcount range targeted by one onboarding "type d'entreprise" label.
 * Primary source = the NUMBERS the seller actually selected — « PME (50-500
 * salariés) » / « ETI (500-5 000 salariés) » are parsed as-is. Labels without
 * an explicit range fall back to a commented, conventional bound; labels that
 * express no size at all (« Secteur public & Collectivités ») map to nothing.
 */
function headcountRangeForTargetType(label: string): HeadcountRange | null {
  // Light normalization only (lowercase + accents) — the full `normalize`
  // would erase the range separator « - » of « ETI (500-5 000 salariés) ».
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  // « X-Y salariés » embedded in the label — the seller's own numbers win.
  const range = /(\d[\d\s]*)(?:-|–|\ba\b)\s*(\d[\d\s]*)/.exec(normalized)
  if (range?.[1] && range[2]) {
    const min = Number(range[1].replace(/\s/g, ''))
    const max = Number(range[2].replace(/\s/g, ''))
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) return { min, max }
  }
  // Grands comptes (CAC40/SBF120) : conventionnellement ≥ 5 000 salariés.
  if (normalized.includes('cac40') || normalized.includes('sbf') || normalized.includes('grand')) {
    return { min: 5000, max: Number.POSITIVE_INFINITY }
  }
  // Startups & scale-ups : structures jeunes, conventionnellement ≤ 250.
  if (normalized.includes('startup') || normalized.includes('scale')) {
    return { min: 1, max: 250 }
  }
  // Libellé sans dimension de taille (ex. « Secteur public ») → pas de borne.
  return null
}

/** True when the label targets startups/scale-ups specifically — the ONE
 *  "type d'entreprise" whose headcount range alone doesn't say much: 1-250
 *  salariés recoupe aussi bien une jeune pousse qu'une TPE vieille de vingt
 *  ans. `matchesTargetHeadcount` s'en sert pour exiger, en plus de la
 *  tranche, l'absence de preuve contraire sur l'âge (#3092). */
function isStartupTargetType(label: string): boolean {
  const normalized = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return normalized.includes('startup') || normalized.includes('scale')
}

/** Seuil conventionnel d'une structure « jeune » au sens startup/scale-up —
 *  même ordre de grandeur que le critère d'âge du label French Tech
 *  Next40/120. Jamais une pénalité : une date de création ABSENTE ne retire
 *  rien (aucune donnée inventée) — seule une date CONNUE et dépassée écarte
 *  le candidat du critère « type d'entreprise ciblé : startup ». */
const YOUNG_COMPANY_MAX_YEARS = 8

/** `true` seulement quand le registre publie une date de création qui
 *  CONFIRME que la structure a dépassé l'âge « jeune » — jamais sur une date
 *  absente ou illisible.
 *
 * Retour #3092 (call bêta Apricot Labs) : « Laura a renvoyé des
 * micro-entreprises et pas des startups » — une TPE créée en 1998 et une
 * startup créée en 2024 partagent la même tranche d'effectifs 1-250 et
 * étaient comptées, l'une comme l'autre, « type d'entreprise ciblé : Startups
 * & Scale-ups ». */
function isConfirmedEstablished(creationDate: string | null | undefined, now: Date): boolean {
  if (!creationDate) return false
  const created = new Date(creationDate)
  if (Number.isNaN(created.getTime())) return false
  const years = (now.getTime() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return years >= YOUNG_COMPANY_MAX_YEARS
}

/** True when the candidate's registry headcount range overlaps at least one
 *  of the seller's targeted ranges. Skipped (false) without registry data.
 *
 *  #3092 — pour un type ciblé « startup »/« scale-up », une date de création
 *  registre CONNUE et confirmée établie ({@link isConfirmedEstablished})
 *  écarte le candidat de CE critère précis : les autres types ciblés (PME,
 *  ETI, grands comptes…) et les autres axes (secteur, géographie) restent
 *  intacts, seul le supplément « c'est une jeune structure » n'est plus
 *  accordé sans preuve. */
function matchesTargetHeadcount(
  candidate: { employees_min?: number | null; employees_max?: number | null; creation_date?: string | null },
  targetCompanyTypes: readonly string[],
  now: Date = new Date(),
): boolean {
  const min = candidate.employees_min ?? candidate.employees_max
  const max = candidate.employees_max ?? candidate.employees_min
  if (min == null || max == null) return false
  return targetCompanyTypes.some(targetType => {
    const range = headcountRangeForTargetType(targetType)
    if (!range || min > range.max || max < range.min) return false
    if (isStartupTargetType(targetType) && isConfirmedEstablished(candidate.creation_date, now)) return false
    return true
  })
}

/* ------------------------------------------------------------------ */
/*  #2127.26 / .27 — ce qu'un candidat PARTAGE avec le compte ouvert    */
/* ------------------------------------------------------------------ */

/** Les bornes d'un effectif saisi en texte libre — « 5 000 - 9 999 » → 5000..9999,
 *  « 300 » → 300..300. `null` quand le texte ne porte aucun nombre. */
function headcountBoundsOf(text: string): HeadcountRange | null {
  const numbers = (text.match(/\d{1,3}(?:[\s.]\d{3})+|\d+/g) ?? []).map(chunk => Number(chunk.replace(/[\s.]/g, '')))
  const [first, second] = numbers
  if (first === undefined || !Number.isFinite(first)) return null
  const other = second !== undefined && Number.isFinite(second) ? second : first
  return { min: Math.min(first, other), max: Math.max(first, other) }
}

/**
 * #2127.26 / .27 — LA ZONE ET LA TAILLE que le candidat partage avec le compte
 * dont le dossier est ouvert.
 *
 * Distinct de {@link matchSimilarCandidate}, qui lit le candidat contre le PROFIL
 * du vendeur (« ce que tu cibles ») : ici, la référence est une entreprise.
 *
 * ⚠️ Seul ce qui se vérifie des DEUX côtés entre dans la liste. Un siège sans
 * code postal ni ville reconnaissable, un effectif illisible, un candidat sans
 * tranche registre : le critère se tait. Jamais « zone différente », jamais
 * « autre taille » — une absence de donnée n'est pas une différence.
 */
export function sharedWithReference(
  reference: { readonly headquarters: string | null; readonly employees: string | null },
  candidate: Pick<CompanySuggestion, 'city' | 'postal_code' | 'employees_min' | 'employees_max'>,
): SimilaritySharedCriterion[] {
  const shared: SimilaritySharedCriterion[] = []

  const headquarters = reference.headquarters?.trim() ?? ''
  if (headquarters) {
    const referencePostal = /\b(\d{5})\b/.exec(headquarters)?.[1]
    const referenceDepartment = referencePostal ? departmentFromPostalCode(referencePostal) : null
    const candidateDepartment = candidate.postal_code ? departmentFromPostalCode(candidate.postal_code) : null
    const sameDepartment = referenceDepartment !== null && referenceDepartment === candidateDepartment
    // Même garde que `matchesGeoZones` : une ville de moins de 3 lettres serait
    // « contenue » dans n'importe quelle adresse.
    const city = candidate.city ? normalize(candidate.city) : ''
    const sameCity = city.length >= 3 && ` ${normalize(headquarters)} `.includes(` ${city} `)
    // #2127.27 — le territoire se cite comme raison, il ne reste pas au serveur :
    // `reference_shared` traverse jusqu'à `AccountSimilarContainer.tsx`
    // (« En commun : même zone… »), l'APPELANT qui manquait au 14/09.
    if (sameDepartment || sameCity) shared.push('geo')
  }

  const bounds = reference.employees ? headcountBoundsOf(reference.employees) : null
  const min = candidate.employees_min ?? candidate.employees_max
  const max = candidate.employees_max ?? candidate.employees_min
  if (bounds && min != null && max != null && bounds.min <= max && bounds.max >= min) shared.push('size')

  return shared
}

/**
 * #2127.30 — AU MOINS UNE FAMILLE DE RÔLES RECRUTÉE EN COMMUN.
 *
 * Un rapprochement d'ENTREPRISES, jamais de personnes : les deux listes sont des
 * comptages `market_company_signal.role_families` (déjà débarrassés du seau
 * résiduel « Autre » par l'appelant — {@link MarketMemoryService.roleFamiliesManyFor}),
 * jamais un contact, un nom ou une adresse.
 *
 * `null` = ce côté n'est pas COUVERT par la mémoire marché — « on ne sait pas »,
 * jamais « aucune famille en commun ». Le repli sur la casse et les espaces
 * évite qu'une virgule de saisie sépare deux corpus qui parlent de la même
 * famille (« PMO » vs « pmo »).
 */
export function sharedRoleFamilies(reference: readonly string[] | null, candidate: readonly string[] | null): boolean {
  if (!reference || !candidate) return false
  const candidateFolded = new Set(candidate.map(family => family.trim().toLowerCase()))
  return reference.some(family => candidateFolded.has(family.trim().toLowerCase()))
}

/**
 * #2127.29 — ajoute UN critère partagé à ceux qu'une suggestion porte déjà, sans
 * doublon et dans l'ordre du contrat (`SIMILARITY_SHARED_CRITERIA`) : deux
 * composeurs (le service pour la zone et la taille, le contrôleur pour la mémoire
 * marché) écrivent le même champ, l'ordre ne doit dépendre d'aucun des deux.
 */
export function withSharedCriterion<T extends { reference_shared?: SimilaritySharedCriterion[] }>(
  suggestion: T,
  criterion: SimilaritySharedCriterion,
): T {
  const current = suggestion.reference_shared ?? []
  if (current.includes(criterion)) return suggestion
  return {
    ...suggestion,
    reference_shared: SIMILARITY_SHARED_CRITERIA.filter(entry => entry === criterion || current.includes(entry)),
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

type ScoredCandidate = {
  suggestion: CompanySuggestion
  /** The NAF-division discovery seed token (« banque », « informatique »…) —
   *  counted as sector text since the candidate was NAF-filtered on it. */
  seed: string
}

/**
 * Le détail d'un rapprochement : le score ET les critères qui l'ont produit.
 *
 * Le module ne rendait qu'un NOMBRE, et c'est ce qui a fait échouer SIM-01
 * (audit terrain du 17/08). Trois critères de poids 3-2-2 s'écrasent dans un
 * scalaire, si bien que l'écran affichait la même phrase — « proche de ta cible
 * sur plusieurs critères » — pour un compte qui coche les trois et pour un compte
 * qui n'en coche aucun. Le commentaire de `similarProximity.ts` côté web le
 * disait déjà : « nommer les critères matchés exige que l'API les expose ».
 *
 * Une recommandation qu'on ne peut pas justifier ne coûte pas seulement un clic
 * perdu : elle décrédibilise tout le scoring du produit, y compris celui qui est
 * juste.
 */
type SimilarReason = SimilarityReason

type SimilarMatch = {
  /**
   * Le score BRUT du rapprochement (0..{@link SIMILAR_SCORE_MAX}).
   *
   * ⚠️ Il sert à CLASSER, il ne se publie pas tel quel : un score dont les axes
   * n'étaient pas tous évaluables ne dit pas « moins proche », il dit « moins
   * su ». Voir `confidence` et {@link SIMILARITY_AXES_REQUIRED}.
   */
  score: number
  /** Les critères RÉELLEMENT matchés, du plus lourd au plus léger. Vide = le
   *  candidat ne vient que du secteur registre, et l'écran doit le dire. */
  reasons: SimilarReason[]
  /** #2040.18 — les axes que le questionnaire rendait ÉVALUABLES. */
  evaluated: SimilarReason[]
  /** #2040.18 — ceux qu'il ne rendait pas évaluables, NOMMÉS. Jamais un 0. */
  unevaluated: SimilarReason[]
  /** #2040.18 — le palier de confiance, qualitatif et nommé. */
  confidence: SimilarityConfidence
}

/**
 * #2040.15 / #2040.18 — LES TROIS AXES, ET LA RÉPONSE QUI LES OUVRE.
 *
 * Chaque axe du rapprochement est adossé à UNE réponse du questionnaire
 * d'onboarding. Sans cette réponse, l'axe n'est pas « raté » : il n'a pas été
 * mesuré, et il sort du jugement au lieu d'y peser 0.
 *
 * L'ordre est celui des poids (secteur 3, géo 2, taille 2) — le même que
 * `REASON_ORDER` côté app, pour qu'une carte se lise du plus discriminant au
 * moins discriminant.
 */
const SIMILARITY_AXES: readonly SimilarReason[] = ['sector', 'geo', 'size']

/** Les zones du profil, telles que `esnAnswersToProfileData` les joint (« , »).
 *  UN seul découpage, lu par le score ET par l'inventaire des axes évaluables :
 *  deux découpages divergeraient le jour où la jointure change. */
function geoZonesOf(profile: AnalysisProfileData): string[] {
  return (profile.geoZone ?? '')
    .split(',')
    .map(zone => zone.trim())
    .filter(Boolean)
}

/**
 * #2040.18 — les axes que LES RÉPONSES rendent évaluables, dans l'ordre des
 * poids. C'est la seule chose que le questionnaire décide ici : un axe dont la
 * réponse manque ne peut ni matcher ni ne pas matcher.
 */
export function evaluableSimilarityAxes(profile: AnalysisProfileData): SimilarReason[] {
  const open: Record<SimilarReason, boolean> = {
    sector: (profile.sectors ?? []).length > 0,
    geo: geoZonesOf(profile).length > 0,
    size: (profile.targetCompanyTypes ?? []).length > 0,
  }
  return SIMILARITY_AXES.filter(axis => open[axis])
}

/**
 * #2040.18 — le palier de confiance, dérivé du NOMBRE d'axes évaluables et de
 * rien d'autre. Qualitatif, nommé, jamais un pourcentage.
 */
export function similarityConfidenceOf(evaluated: readonly SimilarReason[]): SimilarityConfidence {
  if (evaluated.length >= SIMILARITY_AXES_REQUIRED) return 'etayee'
  return evaluated.length > 0 ? 'partielle' : 'non_etayee'
}

/**
 * #2040.15 — LES SECTEURS REFUSÉS AU QUESTIONNAIRE SORTENT LE CANDIDAT DU JEU.
 *
 * `no_go_sectors` (Temps 2 de l'onboarding) voyageait jusqu'aux prompts de
 * stratégie — « ne construis jamais d'angle sur ces secteurs » — et nulle part
 * ailleurs. La découverte, elle, est SEMÉE par le secteur registre du
 * portefeuille : un espace qui a un client BTP se voyait donc proposer du BTP
 * qu'il venait d'écrire noir sur blanc ne pas vouloir.
 *
 * C'est une EXCLUSION, pas une pénalité : un refus n'est pas « un peu moins
 * bien », et le rétrograder dans le classement l'aurait quand même affiché dès
 * que le portefeuille est petit. Deux jeux de réponses rendent donc deux JEUX
 * de comptes, pas deux ordres du même jeu.
 *
 * Le rapprochement se fait par les MÊMES mots-clés que les secteurs cibles
 * (`matchesTargetSectors`) : un refus se dit dans le même vocabulaire qu'une
 * cible, sinon « BTP & Construction » refusé ne reconnaîtrait pas un candidat
 * « Construction de bâtiments ». Profil muet ⇒ personne n'est exclu.
 */
export function isNoGoCandidate(candidate: ScoredCandidate, profile: AnalysisProfileData): boolean {
  const refused = profile.noGoSectors ?? []
  if (refused.length === 0) return false
  return matchesTargetSectors(`${candidate.suggestion.sector} ${candidate.seed}`, refused)
}

/**
 * Raw hybrid score of one discovery candidate against the seller profile, WITH
 * the criteria that produced it. Each matched criterion adds its weight; missing
 * data adds 0 (never negative). Range: 0..{@link SIMILAR_SCORE_MAX}.
 */
export function matchSimilarCandidate(candidate: ScoredCandidate, profile: AnalysisProfileData): SimilarMatch {
  const reasons: SimilarReason[] = []
  let score = 0

  // Secteur (poids 3) — mots-clés des secteurs cibles du vendeur retrouvés
  // dans le libellé NAF du candidat (ou le seed NAF de la découverte).
  const sectors = profile.sectors ?? []
  if (sectors.length > 0 && matchesTargetSectors(`${candidate.suggestion.sector} ${candidate.seed}`, sectors)) {
    score += WEIGHT_SECTOR
    reasons.push('sector')
  }

  // Géographie (poids 2) — dept/région du siège (code postal Pappers) ou ville
  // dans une zone RESTRICTIVE du profil. `geoZone` est la jointure « , » des
  // réponses onboarding (cf. esnAnswersToProfileData).
  const zones = geoZonesOf(profile)
  if (zones.length > 0 && matchesGeoZones(candidate.suggestion, zones)) {
    score += WEIGHT_GEO
    reasons.push('geo')
  }

  // Taille (poids 2) — effectifs registre du candidat dans une tranche ciblée.
  const targetTypes = profile.targetCompanyTypes ?? []
  if (targetTypes.length > 0 && matchesTargetHeadcount(candidate.suggestion, targetTypes)) {
    score += WEIGHT_SIZE
    reasons.push('size')
  }

  // #2040.18 — le score ne voyage jamais nu. Les axes que le questionnaire n'a
  // pas ouverts sont NOMMÉS, et le palier de confiance dit en un mot si le
  // score veut dire quelque chose. Un axe non évaluable n'a rien retiré au
  // score (il n'ajoute simplement rien) : c'est bien « non mesuré », pas 0.
  const evaluated = evaluableSimilarityAxes(profile)
  const unevaluated = SIMILARITY_AXES.filter(axis => !evaluated.includes(axis))

  return { score, reasons, evaluated, unevaluated, confidence: similarityConfidenceOf(evaluated) }
}

/** Le seul score, pour les appelants qui n'ont pas besoin du détail. */
export function scoreSimilarCandidate(candidate: ScoredCandidate, profile: AnalysisProfileData): number {
  return matchSimilarCandidate(candidate, profile).score
}

/**
 * Stable rank: score DESC, ties keep the input (discovery) order — an empty
 * profile therefore returns the exact input order.
 */
export function rankSimilarCandidates<T extends ScoredCandidate>(
  candidates: readonly T[],
  profile: AnalysisProfileData,
): Array<T & SimilarMatch> {
  return (
    candidates
      // #2040.15 — le refus d'abord : un secteur écarté au questionnaire ne se
      // classe pas, il sort. Profil muet ⇒ `isNoGoCandidate` est faux partout et
      // la liste est byte-identique à celle d'avant ce point.
      .filter(candidate => !isNoGoCandidate(candidate, profile))
      .map(candidate => ({ ...candidate, ...matchSimilarCandidate(candidate, profile) }))
      .sort((a, b) => b.score - a.score)
  )
}

/**
 * #1576 — DONNER SA PLACE À CHAQUE AMORCE AVANT D'EN SERVIR UNE DEUXIÈME FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE ÇA CORRIGE, MESURÉ EN PRODUCTION LE 08/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le moteur retient jusqu'à trois amorces, interroge la découverte pour chacune,
 * CONCATÈNE les résultats, classe, puis coupe aux quatre premiers. Quand le
 * profil vendeur est vide — le cas de tout espace qui n'a pas rempli le
 * questionnaire — tous les scores valent 0, le tri est stable, donc l'ordre
 * final est l'ordre de découverte : **les six résultats de la PREMIÈRE amorce
 * remplissent les quatre places.**
 *
 * Mesuré sur l'espace de démonstration : `seed_count: 3`, et les quatre cartes
 * étaient quatre transporteurs routiers issus du seul compte « NOVA LOGISTIQUE ».
 * L'écran annonçait donc un voisinage de portefeuille en montrant le
 * prolongement d'un compte — et le retour le dit avec ses mots : « le secteur ne
 * distingue pas trois transporteurs entre eux ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RÈGLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne re-classe RIEN : le meilleur de chaque amorce est pris dans l'ordre du
 * classement, puis les places restantes sont comblées dans l'ordre du classement.
 * Un profil rempli garde donc son meilleur candidat en tête ; ce qui change est
 * seulement qu'une amorce ne peut plus occuper toutes les places tant qu'une
 * autre n'a pas eu la sienne.
 */
export function spreadAcrossSeeds<T>(ranked: readonly T[], limit: number, keyOf: (item: T) => string): T[] {
  if (limit <= 0) return []

  const picked: T[] = []
  const takenSeeds = new Set<string>()
  const takenItems = new Set<T>()

  // 1er tour — le meilleur de chaque amorce, dans l'ordre du classement.
  for (const item of ranked) {
    if (picked.length >= limit) break
    const key = keyOf(item)
    if (takenSeeds.has(key)) continue
    takenSeeds.add(key)
    takenItems.add(item)
    picked.push(item)
  }

  // 2e tour — les places restantes, toujours dans l'ordre du classement.
  for (const item of ranked) {
    if (picked.length >= limit) break
    if (takenItems.has(item)) continue
    picked.push(item)
  }

  return picked
}
