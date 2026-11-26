import { z } from 'zod'

/**
 * La détection de doublon à l'ingestion d'un talent (PDF 3 §3.4).
 *
 * Le §3.4 donne les clés ET leur ordre, et l'ordre EST la règle : deux
 * personnes qui partagent une adresse professionnelle sont la même personne ;
 * deux personnes qui portent le même nom ne le sont pas. Confondre les deux
 * produit soit des fiches en double (agaçant), soit une fusion abusive (une
 * carrière écrasée par une autre, irrattrapable).
 *
 * Trois décisions structurent ce module :
 *
 *  - **on PROPOSE, on ne fusionne JAMAIS** — invariant du PDF 1, déjà tenu par
 *    la détection de doublons CRM. Une paire porte sa raison et sa confiance,
 *    et c'est un humain qui tranche ;
 *  - **la date de naissance est ABSENTE** des clés, alors que le §3.4 la
 *    propose. C'est un critère protégé (garde GA-06), et le collecter pour
 *    dédupliquer reviendrait à le stocker sur chaque fiche du vivier. Les
 *    quatre autres clés du §3.4 sont livrées ;
 *  - **pure, sans base** : c'est la fonction qui décide si deux personnes n'en
 *    font qu'une. Elle doit se lire et se tester sans monter un service.
 *
 * #2327 (LAU-FINAL-068) — les onze sources d'identité du chapitre : aux quatre
 * clés du §3.4 s'ajoutent l'identifiant externe (ATS/CRM), le profil public, le
 * document, les expériences (employeur + période) et la localisation. Les
 * valeurs sont AJOUTÉES en fin de liste (GA-08) : l'ordre de FORCE vit dans
 * `strongestReason`, pas dans l'ordre du tableau.
 */

export const TALENT_DUPLICATE_REASONS = [
  'same_email', //    adresse professionnelle identique — certain
  'same_phone', //    téléphone identique — fort
  'same_name_same_employer', // nom + dernier employeur — moyen
  'same_name', //     nom seul — faible, PROPOSE seulement
  // #2327.10 / #2327.11 / #2327.13 — identifiant ATS ou CRM identique, chez le
  // MÊME outil — certain.
  'same_external_id',
  // #2327.4 — profil public identique — fort.
  'same_public_profile',
  // #2327.9 / #2327.16 — le même fichier, octet pour octet, sous deux noms —
  // fort, et on VÉRIFIE : rien n'est écrasé.
  'same_document',
  // #2327.15 — nom + une expérience identique (employeur ET période) — probable.
  'same_name_same_employer_period',
  // #2327.8 — nom + même localisation — faible : la ville corrobore, elle ne
  // désigne personne.
  'same_name_same_location',
  // #2327.7 — au moins deux expériences identiques, sans nom (CV anonymisé).
  'same_experiences',
] as const
export const talentDuplicateReasonSchema = z.enum(TALENT_DUPLICATE_REASONS)
export type TalentDuplicateReason = (typeof TALENT_DUPLICATE_REASONS)[number]

/** La confiance associée à chaque clé, dans l'ordre du §3.4. */
export const TALENT_DUPLICATE_CONFIDENCE: Record<TalentDuplicateReason, number> = {
  same_external_id: 0.95,
  same_email: 0.95,
  same_document: 0.9,
  same_public_profile: 0.9,
  same_phone: 0.8,
  same_name_same_employer_period: 0.7,
  same_name_same_employer: 0.6,
  same_experiences: 0.5,
  same_name_same_location: 0.4,
  same_name: 0.3,
}

/**
 * #2327.26 — ce qui CONCORDE entre deux fiches, dans l'ordre où un humain doit
 * le lire. Une paire rapprochée par l'adresse peut aussi partager trois
 * expériences : la clé la plus forte ne dit pas tout, et « pourquoi ces deux
 * fiches se ressemblent » demande la liste entière.
 */
export const TALENT_IDENTITY_SIGNALS = [
  'external_id',
  'email',
  'document',
  'public_profile',
  'phone',
  'name',
  'employer',
  'experiences',
  'location',
] as const
export type TalentIdentitySignal = (typeof TALENT_IDENTITY_SIGNALS)[number]

/**
 * #2327.18 — les champs renseignés des DEUX côtés qui DIFFÈRENT. Une clé forte
 * accompagnée d'un nom différent n'est pas une certitude : c'est une donnée
 * contradictoire, et elle se montre.
 */
export const TALENT_IDENTITY_CONFLICT_FIELDS = ['name', 'email', 'phone', 'public_profile'] as const
export type TalentIdentityConflictField = (typeof TALENT_IDENTITY_CONFLICT_FIELDS)[number]

/** Au-delà, une ligne n'est plus une expérience mais un paragraphe. */
const EXPERIENCE_LINE_MAX = 200
/** Assez pour un CV entier, pas assez pour qu'un document collé noie la requête. */
const EXPERIENCE_KEYS_MAX = 60
/** Sans nom, une seule ligne commune désigne deux collègues, pas une personne. */
const EXPERIENCES_WITHOUT_NAME_MIN = 2

/** Ce qu'on sait d'une personne au moment de comparer. */
export type TalentIdentity = {
  id: string
  /** `null` quand personne n'a encore donné son nom (D366). Le rapprochement
   *  par nom l'ignore alors — deux inconnus ne sont pas la même personne. */
  fullName: string | null
  email: string | null
  phone: string | null
  /** Dernier employeur connu — un nom de société, pas un identifiant. */
  lastEmployer: string | null
  /**
   * #2327.23 / #2327.24 — l'espace de la fiche. Quand le candidat en porte un,
   * une fiche d'un AUTRE espace — ou d'aucun, comme un référentiel public — ne
   * lui est jamais rapprochée, même à adresse identique.
   */
  workspaceId?: string | null
  /** #2327.4 — l'adresse d'un profil public, telle que saisie. */
  publicProfileUrl?: string | null
  /** #2327.7 — les lignes d'expérience, lues par `readExperienceKeys`. */
  experienceKeys?: readonly string[]
  /** #2327.8 — la localisation déclarée (la première zone), jamais une adresse. */
  location?: string | null
  /** #2327.9 — l'empreinte SHA-256 des fichiers déposés. */
  documentHashes?: readonly string[]
  /** #2327.10 / #2327.11 — `outil:identifiant`, par outil connecté. */
  externalIds?: readonly string[]
}

/** La personne qu'on compare : sans identifiant, sauf quand elle est déjà en base. */
export type TalentIdentityCandidate = Omit<TalentIdentity, 'id'> & {
  /** Une fiche existante ne se rapproche pas d'elle-même. */
  selfId?: string
}

export type TalentDuplicateMatch = {
  talentId: string
  /** Le nom de la fiche RAPPROCHÉE. `null` est possible : un rapprochement par
   *  e-mail ou par téléphone n'a pas besoin d'un nom pour être certain. */
  fullName: string | null
  reason: TalentDuplicateReason
  confidence: number
  /** #2327.26 — tout ce qui concorde, pas seulement la clé retenue. */
  signals: TalentIdentitySignal[]
  /** #2327.26 — le nombre de lignes d'expérience identiques. */
  sharedExperiences: number
  /** #2327.18 — ce qui diverge alors que les deux côtés le renseignent. */
  conflicts: TalentIdentityConflictField[]
}

/** Casse, espaces et accents ne distinguent pas deux personnes. */
function normalise(value: string | null | undefined): string {
  if (!value) return ''
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Un téléphone se compare sur ses CHIFFRES : « 01 42 … » et « +33 1 42 … »
 *  sont le même numéro écrit par deux personnes différentes. */
function digits(value: string | null | undefined): string {
  if (!value) return ''
  const only = value.replace(/\D/g, '')
  // Les indicatifs internationaux se comparent sur la fin du numéro : garder
  // les neuf derniers chiffres rapproche « +33142… » et « 0142… » sans
  // rapprocher deux numéros réellement différents.
  return only.length > 9 ? only.slice(-9) : only
}

/**
 * #2327.4 — une adresse de profil public, sans ce qui ne la distingue pas :
 * protocole, `www.`, paramètres, ancre, barre finale, casse.
 */
export function normalisePublicProfileUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
}

const YEAR = /\b(?:19[5-9]\d|20\d\d)\b/g
const ONGOING = /\b(?:aujourd hui|present|actuel|actuellement|depuis|now|today|current|since)\b/
const MONTHS = new Set([
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
  'janv',
  'fevr',
  'sept',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
])
const ONGOING_WORDS = new Set([
  'aujourd',
  'hui',
  'present',
  'actuel',
  'actuellement',
  'depuis',
  'now',
  'today',
  'current',
  'since',
])

/**
 * #2327.7 — les EXPÉRIENCES d'un CV : les lignes qui portent une PÉRIODE (deux
 * années, ou une année et « aujourd'hui ») et au moins deux mots — l'employeur
 * et le rôle, tels qu'écrits.
 *
 * Une ligne réduite à une date (« Mis à jour le 12 mars 2024 ») n'est pas une
 * expérience : sans intervalle, elle rapprocherait tous les CV produits le même
 * jour par le même modèle de document. Les séparateurs (tirets, barres, points
 * médians) et la ponctuation ne distinguent pas deux écritures de la même
 * ligne.
 */
export function readExperienceKeys(text: string | null | undefined): string[] {
  if (!text) return []
  const keys: string[] = []
  let previous = ''
  const significantWords = (value: string): string[] =>
    value.split(' ').filter(word => /^[a-z]{3,}$/.test(word) && !MONTHS.has(word) && !ONGOING_WORDS.has(word))
  for (const raw of text.split(/\r?\n/)) {
    const line = normalise(raw)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    if (line.length === 0) continue
    const before = previous
    previous = line
    if (line.length > EXPERIENCE_LINE_MAX) continue
    const years = line.match(YEAR) ?? []
    const isPeriod = years.length >= 2 || (years.length === 1 && ONGOING.test(line))
    if (!isPeriod) continue
    let key = line
    if (significantWords(line).length < 2) {
      // #3811.5 — selon l'extracteur (PDF, docx), la période tient sur SA ligne,
      // sous l'employeur : « ACME / Depuis mai 2022 ». L'employeur de la ligne
      // du dessus se lit avec elle — sauf si cette ligne porte elle-même une
      // année (une date n'est pas un employeur). Sans cela, un CV sans nom ne
      // laissait aucune expérience à comparer et se créait en double.
      if (before.length === 0 || before.length > EXPERIENCE_LINE_MAX || (before.match(YEAR) ?? []).length > 0) continue
      key = `${before} ${line}`
    }
    if (significantWords(key).length < 2) continue
    if (!keys.includes(key)) keys.push(key)
    if (keys.length >= EXPERIENCE_KEYS_MAX) break
  }
  return keys
}

/** Une empreinte ou un identifiant externe se compare sans casse ni espaces. */
function tokenSet(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map(value => value.trim().toLowerCase()).filter(Boolean))
}

function intersects(a: Set<string>, b: readonly string[] | undefined): boolean {
  if (a.size === 0) return false
  return [...tokenSet(b)].some(value => a.has(value))
}

/**
 * Les talents existants qui pourraient être la personne qu'on ingère.
 *
 * Rend AU PLUS une correspondance par talent, avec sa clé la plus forte : dire
 * deux fois la même chose sur la même personne ferait douter du reste. Le
 * classement va du plus certain au plus faible, parce que c'est dans cet ordre
 * qu'un humain doit lire la liste.
 */
export function findTalentDuplicates(
  candidate: TalentIdentityCandidate,
  existing: readonly TalentIdentity[],
): TalentDuplicateMatch[] {
  const email = normalise(candidate.email)
  const phone = digits(candidate.phone)
  const name = normalise(candidate.fullName)
  const employer = normalise(candidate.lastEmployer)
  const profile = normalisePublicProfileUrl(candidate.publicProfileUrl)
  const location = normalise(candidate.location)
  const experiences = new Set(candidate.experienceKeys ?? [])
  const documents = tokenSet(candidate.documentHashes)
  const externalIds = tokenSet(candidate.externalIds)
  const scoped = candidate.workspaceId !== undefined

  const matches: TalentDuplicateMatch[] = []
  for (const other of existing) {
    if (candidate.selfId && other.id === candidate.selfId) continue
    // #2327.23 / #2327.24 — un autre espace, ou aucun (un référentiel public),
    // n'est jamais une cible : la comparaison s'arrête avant de regarder.
    if (scoped && (candidate.workspaceId == null || other.workspaceId !== candidate.workspaceId)) continue

    const sharedExperiences = (other.experienceKeys ?? []).filter(key => experiences.has(key)).length
    const matched: Record<TalentIdentitySignal, boolean> = {
      external_id: intersects(externalIds, other.externalIds),
      email: email !== '' && email === normalise(other.email),
      document: intersects(documents, other.documentHashes),
      public_profile: profile !== '' && profile === normalisePublicProfileUrl(other.publicProfileUrl),
      phone: phone !== '' && phone === digits(other.phone),
      name: name !== '' && name === normalise(other.fullName),
      employer: employer !== '' && employer === normalise(other.lastEmployer),
      experiences: sharedExperiences > 0,
      location: location !== '' && location === normalise(other.location),
    }
    const reason = strongestReason(matched, sharedExperiences)
    if (!reason) continue
    matches.push({
      talentId: other.id,
      fullName: other.fullName,
      reason,
      confidence: TALENT_DUPLICATE_CONFIDENCE[reason],
      signals: TALENT_IDENTITY_SIGNALS.filter(signal => matched[signal]),
      sharedExperiences,
      conflicts: conflictsBetween(candidate, other),
    })
  }
  return matches.sort((a, b) => b.confidence - a.confidence)
}

/** Un vivier rangé par clé normalisée — voir {@link indexTalentIdentities}. */
export type TalentIdentityIndex = {
  /** Mêmes réponses, même ordre, que `findTalentDuplicates(candidate, vivier)`. */
  find(candidate: TalentIdentityCandidate): TalentDuplicateMatch[]
  /** Ajoute une fiche, ou REMPLACE celle de même `id` (signaux complétés). */
  add(identity: TalentIdentity): void
}

/**
 * Les clés sous lesquelles une fiche (ou un candidat) peut être rapprochée —
 * une par signal de `findTalentDuplicates`, normalisée EXACTEMENT comme la
 * comparaison la normalise. Deux personnes qui concordent sur un signal
 * partagent donc toujours au moins une clé.
 */
function lookupKeys(identity: Omit<TalentIdentity, 'id'>): string[] {
  const keys: string[] = []
  const push = (prefix: string, value: string) => {
    if (value !== '') keys.push(`${prefix}${value}`)
  }
  push('e:', normalise(identity.email))
  push('p:', digits(identity.phone))
  push('n:', normalise(identity.fullName))
  push('m:', normalise(identity.lastEmployer))
  push('l:', normalise(identity.location))
  push('u:', normalisePublicProfileUrl(identity.publicProfileUrl))
  for (const value of tokenSet(identity.documentHashes)) push('d:', value)
  for (const value of tokenSet(identity.externalIds)) push('x:', value)
  // Les expériences se comparent BRUTES (`Set.has`), sans normalisation.
  for (const value of identity.experienceKeys ?? []) keys.push(`k:${value}`)
  return keys
}

/**
 * Incident boucle API (05/10/2026) — un import ZIP de 688 CV comparait chaque
 * CV au vivier ENTIER (jusqu'à 5 000 fiches, plusieurs normalisations Unicode
 * par fiche), d'un bloc synchrone, sur la boucle de l'API.
 *
 * L'index range le vivier UNE fois par clé normalisée ; une recherche ne
 * soumet à `findTalentDuplicates` que les fiches qui partagent au moins une
 * clé avec le candidat, dans leur ordre d'origine. Une fiche sans clé commune
 * ne concorde sur aucun signal, donc n'aurait produit aucun rapprochement :
 * les réponses sont IDENTIQUES à la comparaison au vivier entier.
 */
export function indexTalentIdentities(existing: readonly TalentIdentity[]): TalentIdentityIndex {
  const identities: TalentIdentity[] = []
  const positionById = new Map<string, number>()
  const positionsByKey = new Map<string, Set<number>>()

  const add = (identity: TalentIdentity): void => {
    let position = positionById.get(identity.id)
    if (position === undefined) {
      position = identities.length
      positionById.set(identity.id, position)
      identities.push(identity)
    } else {
      // Les anciennes clés restent : un sur-ensemble ne change aucune réponse,
      // la comparaison finale relit la fiche à jour.
      identities[position] = identity
    }
    for (const key of lookupKeys(identity)) {
      const positions = positionsByKey.get(key) ?? new Set<number>()
      positions.add(position)
      positionsByKey.set(key, positions)
    }
  }
  for (const identity of existing) add(identity)

  const find = (candidate: TalentIdentityCandidate): TalentDuplicateMatch[] => {
    const positions = new Set<number>()
    for (const key of lookupKeys(candidate)) {
      for (const position of positionsByKey.get(key) ?? []) positions.add(position)
    }
    const subset = [...positions].sort((a, b) => a - b).map(position => identities[position]!)
    return findTalentDuplicates(candidate, subset)
  }

  return { find, add }
}

/** #2327.18 — les champs renseignés des deux côtés, et différents. */
function conflictsBetween(candidate: TalentIdentityCandidate, other: TalentIdentity): TalentIdentityConflictField[] {
  const pairs: Record<TalentIdentityConflictField, [string, string]> = {
    name: [normalise(candidate.fullName), normalise(other.fullName)],
    email: [normalise(candidate.email), normalise(other.email)],
    phone: [digits(candidate.phone), digits(other.phone)],
    public_profile: [
      normalisePublicProfileUrl(candidate.publicProfileUrl),
      normalisePublicProfileUrl(other.publicProfileUrl),
    ],
  }
  return TALENT_IDENTITY_CONFLICT_FIELDS.filter(field => {
    const [a, b] = pairs[field]
    if (a === '' || b === '' || a === b) return false
    return field === 'name' ? !namesCompatible(a, b) : true
  })
}

/**
 * Deux écritures d'un nom se contredisent quand elles ne partagent AUCUN mot :
 * « Y. Berthier » abrège « Yanis Berthier », il ne le contredit pas.
 */
function namesCompatible(a: string, b: string): boolean {
  const words = (value: string) => value.split(/[^a-z]+/).filter(word => word.length >= 2)
  const other = new Set(words(b))
  return words(a).some(word => other.has(word))
}

function strongestReason(
  signals: Record<TalentIdentitySignal, boolean>,
  sharedExperiences: number,
): TalentDuplicateReason | null {
  if (signals.external_id) return 'same_external_id'
  if (signals.email) return 'same_email'
  if (signals.document) return 'same_document'
  if (signals.public_profile) return 'same_public_profile'
  if (signals.phone) return 'same_phone'
  // Le nom SEUL ne suffit pas à rapprocher deux personnes, mais il suffit à
  // poser la question — d'où une confiance basse plutôt qu'un silence.
  if (signals.name && signals.experiences) return 'same_name_same_employer_period'
  if (signals.name && signals.employer) return 'same_name_same_employer'
  if (sharedExperiences >= EXPERIENCES_WITHOUT_NAME_MIN) return 'same_experiences'
  if (signals.name && signals.location) return 'same_name_same_location'
  if (signals.name) return 'same_name'
  return null
}
