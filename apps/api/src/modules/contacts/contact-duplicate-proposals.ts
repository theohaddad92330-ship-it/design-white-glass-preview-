/**
 * #4114 — dédoublonnage FLOU des personnes d'un compte, là où l'identité exacte
 * (`contactIdentityKeys`) ne suffit pas : « JF Martin » et « Jean-François Martin »
 * ne partagent aucune clé, et pourtant…
 *
 * DOCTRINE : on PROPOSE, on ne fusionne JAMAIS. Ce module est PUR — aucune base,
 * aucun appel réseau, aucune écriture ; il rend des paires avec leurs RAISONS
 * lisibles, l'humain tranche.
 *
 * Méthode : appariement probabiliste léger façon Fellegi-Sunter. Chaque
 * comparaison (e-mail, LinkedIn, téléphone, nom, poste) ajoute un POIDS si elle
 * s'accorde, en retire un si elle se contredit ; la somme est comparée à un seuil
 * NOMMÉ. Le blocage est le compte (`accountId`) : deux homonymes de deux sociétés
 * ne sont jamais comparés — la pire erreur d'un CRM commercial. Pas de `splink` :
 * la comparaison est quadratique PAR COMPTE (quelques centaines de fiches au plus,
 * plafond démo 400), ce qui reste de l'ordre de la milliseconde ; une dépendance
 * Python lourde n'apporte rien à cette volumétrie.
 *
 * Coordonnées toujours en clair : les raisons nomment le CRITÈRE, jamais ne masquent.
 */
import { normalizeFullName, normalizeLinkedinUrl, normalizePhone } from './contact-identity'
import { isGenericMailbox } from './generic-mailbox'

/** Seuil de proposition : au-dessous, la paire n'est pas rendue. */
export const PROPOSAL_THRESHOLD = 5

/** Poids (log-vraisemblance simplifiée) de chaque comparaison. */
const WEIGHT = {
  sameEmail: 8,
  sameLinkedin: 8,
  samePhone: 3,
  sameSurname: 3,
  sameFirstName: 3,
  closeFirstName: 2.5,
  initialsFirstName: 2.5,
  initialSurname: 3,
  sameTitle: 2,
  differentSurname: -6,
  differentFirstName: -3,
} as const

const SURNAME_JW = 0.93
const FIRST_NAME_JW = 0.9
/** Au-dessous, deux noms de famille sont tenus pour DIFFÉRENTS (contradiction). */
const SURNAME_CONTRADICTION_JW = 0.8

const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'd', 'di', 'da'])

type DuplicateCandidate = {
  id: string
  accountId: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  title: string | null
  /** L'adresse a-t-elle été VÉRIFIÉE (fournisseur, MX + SMTP) ? Absent = non : « non mesuré » n'est pas « vérifié ». */
  emailVerified?: boolean | null
}

/** Pourquoi une adresse partagée n'est PAS une identité — la raison nommée, rendue à l'écran. */
type SharedEmailReason = 'generic_mailbox' | 'shared_by_many' | 'unverified'

/** UNE cause, UN bloc : « N fiches partagent cette adresse », jamais N(N-1)/2 propositions de fusion. */
export type SharedEmailGroup = {
  email: string
  contactIds: string[]
  reason: SharedEmailReason
}

/** Au-delà, une adresse portée par autant de fiches est une boîte d'équipe ou une donnée fausse. */
const SHARED_BY_MANY_MIN = 3

export type ContactDuplicateProposal = {
  leftId: string
  rightId: string
  score: number
  reasons: string[]
}

export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatched = new Array<boolean>(a.length).fill(false)
  const bMatched = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window)
    const hi = Math.min(b.length - 1, i + window)
    for (let j = lo; j <= hi; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue
      aMatched[i] = true
      bMatched[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue
    while (!bMatched[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

type ParsedName = {
  first: string
  firstIsInitials: boolean
  initials: string
  surname: string
  /** « Claire F. » : le nom de famille n'est que son initiale. */
  surnameIsInitial: boolean
}

/** Les jetons « majuscules » d'un nom de registre : « MARTIN Jean » → prénom en tête. */
function reorderRegistryName(raw: string): string {
  const tokens = raw.trim().split(/\s+/)
  // ≥ 3 lettres : « JF » ou « P. » sont des initiales, pas un patronyme de registre.
  const isUpper = (t: string) =>
    t.replace(/[^\p{L}]/gu, '').length >= 3 && t === t.toUpperCase() && t !== t.toLowerCase()
  if (tokens.length >= 2 && isUpper(tokens[0] ?? '') && !isUpper(tokens[tokens.length - 1] ?? '')) {
    return [...tokens.slice(1), tokens[0]].join(' ')
  }
  return raw
}

function parseName(raw: string | null): ParsedName | null {
  if (!raw) return null
  const tokens = reorderRegistryName(raw).trim().split(/\s+/).filter(Boolean)
  // Au-delà de quatre mots, ce n'est plus un nom de personne (intitulé de poste d'un siège).
  if (tokens.length < 2 || tokens.length > 4) return null
  const rawFirst = tokens[0] ?? ''
  // « Claire, Anne FONTAINE » : prénoms séparés par des virgules, le nom de famille est le DERNIER mot.
  // Avec deux mots seulement (« Martin, Jean »), c'est le format de registre : inchangé.
  const commaForenames = rawFirst.endsWith(',') && tokens.length >= 3
  const surnameTokens = (commaForenames ? tokens.slice(-1) : tokens.slice(1))
    .map(normalizeFullName)
    .filter(t => t && !PARTICLES.has(t))
  const surname = surnameTokens.join(' ')
  const first = normalizeFullName(rawFirst)
  if (!first || !surname) return null
  // « JF », « J. », « J.-F. » : un prénom réduit à des initiales (sans voyelle sûre : ≤ 3 lettres collées).
  const letters = rawFirst.replace(/[^\p{L}]/gu, '')
  const firstIsInitials = rawFirst.includes('.')
    ? letters.length <= 3
    : letters.length <= 2 && letters === letters.toUpperCase()
  const initials = firstIsInitials
    ? normalizeFullName(letters).replace(/ /g, '')
    : first
        .split(' ')
        .map(part => part[0] ?? '')
        .join('')
  const surnameIsInitial = surname.length === 1
  return { first, firstIsInitials, initials, surname, surnameIsInitial }
}

/** Mêmes mots (accents, casse, particules neutralisés) dans un ordre prénom/nom INVERSÉ. */
function sameNameReordered(a: ParsedName, b: ParsedName): boolean {
  if (a.first === b.first && a.surname === b.surname) return false
  const words = (n: ParsedName) => `${n.first} ${n.surname}`.split(' ').filter(Boolean).sort().join(' ')
  return !a.firstIsInitials && !b.firstIsInitials && words(a) === words(b)
}

function sameTitle(a: string | null, b: string | null): boolean {
  const x = normalizeFullName(a)
  return x !== '' && x === normalizeFullName(b)
}

const emailKey = (row: DuplicateCandidate): string => {
  const email = (row.email ?? '').trim().toLowerCase()
  return email.includes('@') ? email : ''
}

/**
 * #4600 — l'adresse partagée vaut-elle PREUVE d'identité ? Seulement si elle est vérifiée sur les deux fiches, portée
 * par moins de trois fiches du compte, et n'est pas une boîte générique. Sinon : `null` (c'est un indice qu'on ne
 * compte pas), et la raison pour laquelle elle n'en est pas un sinon.
 */
function whyEmailIsNotIdentity(
  email: string,
  holders: readonly Pick<DuplicateCandidate, 'emailVerified'>[],
): SharedEmailReason | null {
  if (isGenericMailbox(email)) return 'generic_mailbox'
  // Non vérifiée d'abord : c'est la raison qui dit quoi FAIRE (la vérifier ou la vider), même à huit fiches.
  if (!holders.every(row => row.emailVerified === true)) return 'unverified'
  if (holders.length >= SHARED_BY_MANY_MIN) return 'shared_by_many'
  return null
}

/**
 * #4600.4 — la MÊME règle que le balayage du compte, pour la fiche d'UN contact : `holders` = les fiches du compte
 * qui portent l'adresse (la fiche regardée comprise). Une adresse qui n'est pas une preuve d'identité (boîte
 * générique, non vérifiée, partagée par trois fiches ou plus) ne désigne pas un « doublon probable ».
 */
export function emailProvesIdentity(
  email: string,
  holders: readonly Pick<DuplicateCandidate, 'emailVerified'>[],
): boolean {
  return whyEmailIsNotIdentity(email, holders) === null
}

function holdersByEmail(block: readonly DuplicateCandidate[]): Map<string, DuplicateCandidate[]> {
  const byEmail = new Map<string, DuplicateCandidate[]>()
  for (const row of block) {
    const key = emailKey(row)
    if (!key) continue
    const holders = byEmail.get(key)
    if (holders) holders.push(row)
    else byEmail.set(key, [row])
  }
  return byEmail
}

function compare(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
  emailIsIdentity: (email: string) => boolean,
): ContactDuplicateProposal | null {
  let score = 0
  const reasons: string[] = []
  const strong: string[] = []

  const emailA = emailKey(a)
  if (emailA && emailA === emailKey(b) && emailIsIdentity(emailA)) {
    score += WEIGHT.sameEmail
    strong.push('même e-mail')
  }
  const liA = normalizeLinkedinUrl(a.linkedinUrl)
  if (liA && liA === normalizeLinkedinUrl(b.linkedinUrl)) {
    score += WEIGHT.sameLinkedin
    strong.push('même profil LinkedIn')
  }
  const telA = normalizePhone(a.phone)
  if (telA && telA === normalizePhone(b.phone)) {
    score += WEIGHT.samePhone
    strong.push('même téléphone')
  }

  const na = parseName(a.fullName)
  const nb = parseName(b.fullName)
  const nameReasons: string[] = []
  if (na && nb && sameNameReordered(na, nb)) {
    // LOIC-FIX2 O.5 — « Cottet Alain » / « Alain COTTET » : mêmes mots, ordre prénom/nom inversé, casse sans effet.
    score += WEIGHT.sameSurname + WEIGHT.sameFirstName
    nameReasons.push('même nom')
  } else if (
    na &&
    nb &&
    (na.surnameIsInitial || nb.surnameIsInitial) &&
    !(na.surnameIsInitial && nb.surnameIsInitial)
  ) {
    // « Claire F. » ≡ « Claire FONTAINE » : même prénom ET initiale du nom compatible. Le blocage par compte
    // (même employeur) est ce qui rend l'indice suffisant ; un prénom différent ou une autre initiale = contradiction.
    const [short, long] = na.surnameIsInitial ? [na, nb] : [nb, na]
    if (short.first === long.first && long.surname.startsWith(short.surname)) {
      score += WEIGHT.sameFirstName + WEIGHT.initialSurname
      nameReasons.push('nom proche (initiale du nom)')
    } else {
      score += WEIGHT.differentSurname
    }
  } else if (na && nb) {
    const surnameJw = jaroWinkler(na.surname, nb.surname)
    if (surnameJw >= SURNAME_JW) {
      score += WEIGHT.sameSurname
      if (na.first === nb.first && na.surname === nb.surname) {
        score += WEIGHT.sameFirstName
        nameReasons.push('même nom')
      } else if (na.firstIsInitials || nb.firstIsInitials) {
        const [short, long] = na.firstIsInitials ? [na, nb] : [nb, na]
        if (long.initials.startsWith(short.initials)) {
          score += WEIGHT.initialsFirstName
          nameReasons.push('nom proche (initiales compatibles)')
        } else {
          score += WEIGHT.differentFirstName
        }
      } else if (
        jaroWinkler(na.first, nb.first) >= FIRST_NAME_JW ||
        na.first.replace(/ /g, '') === nb.first.replace(/ /g, '')
      ) {
        score += WEIGHT.closeFirstName
        nameReasons.push('nom proche')
      } else {
        score += WEIGHT.differentFirstName
      }
    } else if (surnameJw < SURNAME_CONTRADICTION_JW) {
      score += WEIGHT.differentSurname
    }
  }
  reasons.push(...strong, ...nameReasons)
  if (nameReasons.length > 0 && sameTitle(a.title, b.title)) {
    score += WEIGHT.sameTitle
    reasons.push('même poste')
  }

  if (score < PROPOSAL_THRESHOLD || reasons.length === 0) return null
  // Un nom seulement APPROCHÉ (« Sylvain Roue » / « Sylvie Roure ») ne se propose jamais seul :
  // il faut un identifiant partagé ou le même poste. Option conservatrice.
  if (strong.length === 0 && !reasons.includes('même poste') && reasons.every(r => r === 'nom proche')) return null
  const [leftId, rightId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
  return { leftId, rightId, score: Math.round(score * 10) / 10, reasons }
}

/** Clé stable d'une paire non orientée — celle d'un éventuel refus humain. */
export function duplicatePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

/**
 * Propose les paires probablement identiques, BLOQUÉES par compte. Une fiche sans
 * compte n'est comparée à personne. `rejectedPairs` (clés `duplicatePairKey`) :
 * une paire refusée par un humain n'est jamais reproposée.
 */
export function proposeContactDuplicates(
  rows: readonly DuplicateCandidate[],
  options: { rejectedPairs?: ReadonlySet<string> } = {},
): ContactDuplicateProposal[] {
  const blocks = new Map<string, DuplicateCandidate[]>()
  for (const row of rows) {
    if (!row.accountId) continue
    const block = blocks.get(row.accountId)
    if (block) block.push(row)
    else blocks.set(row.accountId, [row])
  }
  const out: ContactDuplicateProposal[] = []
  for (const block of blocks.values()) {
    const holders = holdersByEmail(block)
    const emailIsIdentity = (email: string): boolean => whyEmailIsNotIdentity(email, holders.get(email) ?? []) === null
    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const left = block[i]
        const right = block[j]
        if (!left || !right) continue
        if (options.rejectedPairs?.has(duplicatePairKey(left.id, right.id))) continue
        const hit = compare(left, right, emailIsIdentity)
        if (hit) out.push(hit)
      }
    }
  }
  return out.sort((x, y) => y.score - x.score || x.leftId.localeCompare(y.leftId) || x.rightId.localeCompare(y.rightId))
}

/**
 * #4600 — les adresses partagées qui NE prouvent PAS une identité, une ligne par adresse (bloquées par compte).
 * Lecture pure : l'humain vérifie ou vide l'adresse ; rien n'est fusionné ni écrit.
 */
export function findSharedEmailGroups(rows: readonly DuplicateCandidate[]): SharedEmailGroup[] {
  const blocks = new Map<string, DuplicateCandidate[]>()
  for (const row of rows) {
    if (!row.accountId) continue
    const block = blocks.get(row.accountId)
    if (block) block.push(row)
    else blocks.set(row.accountId, [row])
  }
  const out: SharedEmailGroup[] = []
  for (const block of blocks.values()) {
    for (const [email, holders] of holdersByEmail(block)) {
      if (holders.length < 2) continue
      const reason = whyEmailIsNotIdentity(email, holders)
      if (reason) out.push({ email, contactIds: holders.map(row => row.id).sort(), reason })
    }
  }
  return out.sort((x, y) => y.contactIds.length - x.contactIds.length || x.email.localeCompare(y.email))
}
