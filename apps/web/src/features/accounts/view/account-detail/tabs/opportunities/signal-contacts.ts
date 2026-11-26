import { isOutsideGeoPerimeter, type AnalysisScopeSelection } from '@bellum/contracts'
import { normalizeEventText } from '@/features/accounts/model/watchEvents'
import type { MissionContact } from './account-missions'

/**
 * #4044 (Louis, 12/10) — « les contacts sont les mêmes sur tous les signaux, et en plus ce sont des
 * contacts non français, pour une boîte dont j'ai mis le périmètre en France ».
 *
 * LA sélection des contacts proposés pour UN fait (signal, mission, piste) — un seul endroit (GA-26) :
 *
 *  a. le PÉRIMÈTRE géographique déclaré du compte (même test que l'écartement à l'analyse,
 *     `isOutsideGeoPerimeter` de `@bellum/contracts`) : un contact connu hors périmètre n'est jamais
 *     proposé en premier, et sort dès qu'un contact dans le périmètre existe. Un lieu inconnu reste
 *     proposable (une absence ne prouve rien). Un contact écarté ou masqué n'est jamais proposé.
 *  b. la PERTINENCE pour CE fait : la personne nommée, le rôle concerné, le métier (titre) qui recoupe
 *     l'intitulé, le lieu du poste. Un fait que personne ne recoupe ne reçoit PAS la liste générique
 *     des premiers contacts du compte — c'est elle qui rendait les mêmes noms sur tous les signaux ;
 *     la carte propose alors « Trouver qui contacter ».
 *
 * Aucun critère protégé (âge, genre, origine, photo, adresse…) ne pèse dans le rang : seuls le titre,
 * le lieu de travail et le fait lisent. Coordonnées pro EN CLAIR (c87) : le contact est rendu tel quel.
 */

export type ProposableContact = MissionContact

type SignalContext = {
  /** Le fait, tel qu'affiché (intitulé du signal / de l'offre). */
  text: string
  /** Le rôle concerné, quand la ligne le nomme. */
  role: string | null
  /** Le lieu du fait (un poste), quand il est lu. */
  location: string | null
  /** Une offre d'emploi (#4182.6) : un titre qui recoupe l'intitulé rend la personne « proche du sujet », jamais « liée » au poste. */
  posting?: boolean
}

/** Mots d'annonce sans valeur de métier (lot 766) : jamais une raison de contacter quelqu'un. */
const EMPTY_BUSINESS_WORDS = [
  'secteur',
  'tech',
  'offre',
  'offres',
  'industrie',
  'projet',
  'projets',
  'poste',
  'postes',
  'recrutement',
  'recrute',
  'societe',
  'entreprise',
  'service',
  'services',
  'solutions',
  'conseil',
  'ouvert',
  'h f',
]

/**
 * #5031 (lot 763) — POURQUOI ce contact est proposé, précisément (la sélection le calcule déjà ; l'écran l'affiche).
 * Jamais « manager du poste » (#4182.6) : un métier ou un lieu en commun ne LIE personne.
 */
export type ContactReason =
  | { kind: 'named' }
  /** Lot 768 — le prescripteur d'un besoin passé (mémoire marché / CRM) qui est un contact du compte. */
  | { kind: 'carried' }
  | { kind: 'role' }
  | { kind: 'craft'; words: string[] }
  | { kind: 'place'; place: string }

type Proposal = {
  contacts: ProposableContact[]
  match: 'role' | 'known' | 'none'
  /** La raison de chaque contact proposé, par id. Absent quand personne n'est proposé. */
  reasons?: Record<string, ContactReason>
}

const MAX_REASON_WORDS = 2

/** Les mots d'un titre qui recoupent le fait, dans l'écriture du titre (accents et casse conservés), 2 au plus. */
function sharedTitleWords(title: string, factWords: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const key = normalizeEventText(raw)
    if (!factWords.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(raw)
    if (out.length === MAX_REASON_WORDS) break
  }
  return out
}

/** Au-delà, on ne lit plus : le reste se trouve dans l'onglet contacts. */
const PROPOSED_SHOWN = 2

const STOP_WORDS = new Set(['des', 'les', 'pour', 'and', 'the', 'sur', 'aux', 'une'])

/** Les mots d'un intitulé de poste qui ne disent rien de l'équipe : ils ne lient personne. */
const GENERIC_JOB_WORDS = new Set([
  'des',
  'les',
  'pour',
  'and',
  'the',
  'sur',
  'aux',
  'une',
  'avec',
  'chez',
  'dans',
  'ingenieur',
  'engineer',
  'engineering',
  'senior',
  'junior',
  'confirme',
  'experimente',
  'lead',
  'head',
  'chef',
  'responsable',
  'manager',
  'director',
  'directeur',
  'directrice',
  'consultant',
  'consultante',
  'stage',
  'stagiaire',
  'alternance',
  'alternant',
  'apprenti',
  'cdi',
  'cdd',
  'freelance',
  'intern',
  'charge',
  'chargee',
  'assistant',
  'assistante',
  'specialist',
  'specialiste',
  'expert',
  'experte',
  'officer',
  'principal',
  'staff',
  'team',
  'equipe',
  'groupe',
  'france',
  'paris',
  ...EMPTY_BUSINESS_WORDS.flatMap(word => word.split(' ')),
])

export function postingWords(value: string): Set<string> {
  return new Set(
    normalizeEventText(value)
      .split(' ')
      .filter(word => word.length >= 3 && !GENERIC_JOB_WORDS.has(word)),
  )
}

function roleWords(value: string | null | undefined): Set<string> {
  const text = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return new Set(text.split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !STOP_WORDS.has(word)))
}

function overlaps(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const word of left) if (right.has(word)) return true
  return false
}

/**
 * #3679 — LE MÊME rapprochement rôle ↔ titre que `withContacts` ci-dessus,
 * exporté pour que « Préparer l'approche » (`QualificationLeadsQueue`, la
 * piste AVANT qu'elle devienne une mission) ouvre le MÊME brouillon de
 * message ciblé, sans recalculer le rapprochement une seconde fois (GA-26).
 * `[]` = aucun titre connu ne recoupe le rôle — jamais un contact deviné.
 */
export function matchContactsForRole<T extends Pick<MissionContact, 'title'>>(
  role: string | null,
  contacts: readonly T[],
): T[] {
  const words = roleWords(role)
  if (words.size === 0) return []
  return contacts.filter(contact => roleWords(contact.title).size > 0 && overlaps(words, roleWords(contact.title)))
}

function proposable(contact: ProposableContact): boolean {
  return Boolean(contact.full_name?.trim()) && !contact.excluded_at && !contact.hidden
}

/** Le lieu de travail lu à la collecte, au format que lit le test de périmètre de l'analyse. */
function isOutsidePerimeter(contact: ProposableContact, perimeter: AnalysisScopeSelection | undefined): boolean {
  if (!perimeter) return false
  return isOutsideGeoPerimeter(
    {
      country: contact.place?.country ?? null,
      city: contact.place?.city ?? null,
      location: contact.location ?? null,
      title: contact.title ?? null,
      organization: contact.place?.organization ?? null,
    },
    perimeter,
  )
}

function mentionedIn(text: string, contact: ProposableContact): boolean {
  const name = normalizeEventText(contact.full_name ?? '')
  return name.includes(' ') && ` ${normalizeEventText(text)} `.includes(` ${name} `)
}

export function proposeContactsForSignal(input: {
  contacts: readonly ProposableContact[]
  signal: SignalContext
  perimeter: AnalysisScopeSelection | undefined
  /** Lot 766 — le nom du compte : jamais un mot de métier commun. */
  accountName?: string | null
}): Proposal {
  const { signal, perimeter } = input
  const pool = input.contacts.filter(proposable)
  const outside = new Set(pool.filter(contact => isOutsidePerimeter(contact, perimeter)).map(contact => contact.id))
  const hasInside = pool.some(contact => !outside.has(contact.id))
  const eligible = hasInside ? pool.filter(contact => !outside.has(contact.id)) : pool

  // Lot 766 — ni le nom du compte (toutes ses formes) ni le lieu du fait ne sont un « métier » commun.
  const accountWords = new Set(
    normalizeEventText(input.accountName ?? '')
      .split(' ')
      .filter(word => word.length >= 3),
  )
  const placeWords = postingWords(signal.location ?? '')
  const baseFactWords = new Set(
    [...postingWords(signal.text)].filter(word => !accountWords.has(word) && !placeWords.has(word)),
  )
  const roleMatched = new Set(matchContactsForRole(signal.role, eligible).map(contact => contact.id))
  const scored = eligible.map((contact, index) => {
    const named = mentionedIn(signal.text, contact)
    // Le lieu du contact n'est pas non plus un métier : « Lyon » dans un titre ou une adresse = un lieu.
    const contactPlace = postingWords(`${contact.location ?? ''} ${contact.place?.city ?? ''}`)
    const factWords = new Set([...baseFactWords].filter(word => !contactPlace.has(word)))
    const titleHits = [...postingWords(contact.title ?? '')].filter(word => factWords.has(word)).length
    const sharedCity = [...contactPlace].find(word => postingWords(signal.text).has(word) && !accountWords.has(word))
    const placeHit = (placeWords.size > 0 && overlaps(placeWords, contactPlace)) || sharedCity !== undefined
    const cityLabel = (contact.place?.city ?? contact.location ?? '').split(',')[0]?.trim() ?? ''
    // #4182.6 (Louis 15/10/2026) — « lié » = la personne est NOMMÉE ou son rôle est celui que la mission déclare.
    // Une FONCTION qui recoupe l'intitulé d'une offre, ou un LIEU en commun, ne lie personne : le contact est
    // « proche de ce sujet (métier ou lieu) » — jamais « manager » du poste.
    const linked = named || roleMatched.has(contact.id)
    const relevant = linked || titleHits > 0 || placeHit
    const score = (named ? 100 : 0) + (roleMatched.has(contact.id) ? 10 : 0) + titleHits * 3 + (placeHit ? 2 : 0)
    const reason: ContactReason = named
      ? { kind: 'named' }
      : roleMatched.has(contact.id)
        ? { kind: 'role' }
        : titleHits > 0
          ? { kind: 'craft', words: sharedTitleWords(contact.title ?? '', factWords) }
          : { kind: 'place', place: signal.location?.trim() || cityLabel }
    return { contact, index, linked, relevant, score, reason }
  })
  const relevant = scored.filter(row => row.relevant)
  // Rien ne recoupe ce fait : aucune liste générique (c'est elle qui répétait les mêmes noms).
  if (relevant.length === 0) return { contacts: [], match: 'none' }
  const linked = relevant.filter(row => row.linked)
  const picked = (linked.length > 0 ? linked : relevant)
    // Hors périmètre faute de contact dans le périmètre : lié par le fait seulement, jamais « connu ».
    .filter(row => linked.length > 0 || !outside.has(row.contact.id))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, PROPOSED_SHOWN)
  if (picked.length === 0) return { contacts: [], match: 'none' }
  return {
    contacts: picked.map(row => row.contact),
    match: linked.length > 0 ? 'role' : 'known',
    reasons: Object.fromEntries(picked.map(row => [row.contact.id, row.reason])),
  }
}
