import type { WatchSignal } from '@/features/accounts/model/watch'
import { normalizeEventText } from '@/features/accounts/model/watchEvents'
import type { AnalysisScopeSelection, SalesProfileForRelevance } from '@bellum/contracts'
import { isOffDomainHiringSignal } from '@/features/discover/lib/discover-hiring-domain'
import type { AccountMission, MissionContact } from './account-missions'
import { areNearDuplicateSignals, offerTitleKey } from '@/lib/signal-dedupe'
import { proposeContactsForSignal } from './signal-contacts'

/**
 * #4022 / #4020 (Louis 11/10) — L'ÉCRAN OPPORTUNITÉS EN UNE CARTE PAR FAIT.
 *
 * Avant : six blocs empilés (Missions, Besoins, Signaux, Pistes, Programmes, Affaires), ≈ 8 500 px,
 * le même fait jusqu'à trois fois. Louis : « voir direct les signaux les plus cruciaux : les
 * recrutements en first avec qui contacter ». UNE carte = le fait + sa source datée + la personne à
 * contacter liée + « Préparer le message ». Dérivation PURE : elle lit les signaux de la veille
 * (`buildAccountWatchData` → `distinctWatchEvents`), les missions (`accountMissions`) et les contacts
 * du compte — aucun appel neuf.
 *
 * Sections, dans l'ordre du dézoom :
 *  ① `recruitment` — un poste = une carte. Tri : France → lieu non précisé → hors France (#4020 :
 *    un poste à l'étranger est un signal MOINS puissant, jamais supprimé) ; à rang égal, une carte
 *    avec une personne liée avant une carte sans ; puis le plus récent.
 *  ② `team` — plusieurs postes de la même équipe / techno (vocabulaire FERMÉ, `TEAM_FAMILIES`)
 *    forment UN RÉSUMÉ « besoin d'équipe » qui renvoie vers eux ; tous restent en ① (Louis 11/10).
 *  ③ `vision` — tout autre signal (nomination, levée, rachat, budget, marchés…), le plus récent d'abord.
 *
 * ⚠️ « Un fait = une carte » : une mission fondée sur un signal (même libellé, même source) PREND la
 * carte de ce signal (son titre, ses contacts) ; sans signal correspondant, elle garde sa propre carte.
 * ⚠️ La personne liée ne se devine pas : soit elle est NOMMÉE dans le fait, soit son titre recoupe
 * l'intitulé du poste sur un mot qui n'est pas générique (« ingénieur », « senior »… ne lient rien).
 */

export const RECRUITMENT_SHOWN_FIRST = 5
/** #4022.2 (recette prod 12/10) — « Vision / transformation » : le même repli que les recrutements. */
export const VISION_SHOWN_FIRST = 5

/** Au-delà, on ne lit plus : le reste se trouve dans l'onglet contacts. */
const CARD_CONTACTS_SHOWN = 2

type PlaceRank = 'france' | 'unknown' | 'abroad'
type CardPlace = { rank: PlaceRank; place: string | null }

type OpportunityCardBasis = {
  label: string
  source: string | null
  /** Le jour ISO, ou `null` : jamais une date inventée. */
  date: string | null
  sourceUrl: string | null
  sourceKind: string | null
}

export type OpportunityCard = {
  key: string
  title: string
  basis: OpportunityCardBasis
  /** Le lieu d'un poste (section ①) ; `null` hors recrutement. */
  place: CardPlace | null
  role: string | null
  contacts: MissionContact[]
  /** `role` : personne liée au fait ; `known` : recoupée par métier / lieu sans lien direct ; `none` : personne.
   *  #4044.1 — la carte porte SES contacts ; plus de bloc « contacts connus » partagé entre les cartes. */
  contactsMatch: 'role' | 'known' | 'none'
  origin: 'signal' | 'opportunity' | 'lead'
  /** Le signal de la veille d'où vient la carte, quand il existe — pour l'angle et le plan. */
  signal: WatchSignal | null
  implication: string | null
  /** OFFRES-VEILLE (16/10) — les besoins / difficultés DÉDUITS de cette offre : rangés sous SA carte, jamais en cartes à part. */
  derivedNeeds: string[]
  /** V4-CORRECTIFS-C 4294.6 — offres repliées au même intitulé : leur nombre et leurs lieux (jamais inventés). */
  offerCount?: number
  offerPlaces?: string[]
  /** #4294.6 — combien de fois le MÊME fait a été vu (>= 2) ; absent = vu une fois. Aucun signal n'est supprimé en base. */
  seenCount?: number
}

export type TeamNeedCard = {
  key: string
  /** #4399.2 — `other` : les postes dont aucune famille ne se lit ; ils se listent quand même, sous « Autres postes ». */
  teamKey: TeamKey | typeof OTHER_TEAM
  postings: OpportunityCard[]
  contacts: MissionContact[]
  contactsMatch: 'role' | 'none'
}

/** #4399.2 — les postes ouverts qui ne forment pas une équipe, regroupés par famille de métier (`other` = aucune famille). */
export type OtherNeedGroup = {
  key: string
  family: TeamKey | 'other'
  postings: OpportunityCard[]
}

export type OpportunitySections = {
  recruitment: OpportunityCard[]
  /** #3901.6 — les recrutements HORS des postes visés : dessous, sous « autres recrutements ». Vide sans poste visé déclaré. */
  otherRecruitment: OpportunityCard[]
  team: TeamNeedCard[]
  /** #4399.2 — sous les équipes : les postes ouverts restants, par famille. Vide si tout est déjà en équipe. */
  otherNeeds: OtherNeedGroup[]
  vision: OpportunityCard[]
}

type BuildInput = {
  signals: readonly WatchSignal[]
  missions: readonly AccountMission[]
  contacts: readonly MissionContact[]
  /** #4044 — le périmètre géographique déclaré du compte ; absent = aucun lieu écarté. */
  perimeter?: AnalysisScopeSelection
  /** #3901.6 — le profil DÉCLARÉ (métiers placés) : ce qui sépare les postes visés des autres. Absent = rien séparé. */
  profile?: SalesProfileForRelevance
}

export function buildOpportunitySections(input: BuildInput): OpportunitySections {
  const named = input.contacts.filter(contact => contact.full_name?.trim())
  const missionsLeft = [...input.missions]
  const recruitmentCards: OpportunityCard[] = []
  const vision: OpportunityCard[] = []
  // #4044.1 — chaque carte garde SES contacts (recoupés avec son fait) ; aucun ne se ramasse en bloc commun.
  const linked = (
    text: string,
    isRecruitment: boolean,
    mission: AccountMission | undefined,
    location: string | null,
  ): Pick<OpportunityCard, 'contacts' | 'contactsMatch'> => {
    return linkedContacts(text, isRecruitment, mission, named, input.perimeter, location)
  }

  for (const signal of distinctArticles(input.signals)) {
    // #4396.1 — « Offres d'emploi · France » nomme la source, pas un poste : aucune carte.
    if (isGenericJobsLine(signal.signal)) continue
    const missionIndex = missionsLeft.findIndex(mission => sameFact(mission, signal))
    const mission = missionIndex >= 0 ? missionsLeft.splice(missionIndex, 1)[0] : undefined
    const isRecruitment = isJobSignal(signal)
    const date = isoDay(signal.date)
    const card: OpportunityCard = {
      key: mission?.key ?? signal.id,
      title: mission?.title ?? signal.signal,
      basis: {
        label: signal.signal,
        source: signal.source || null,
        date,
        sourceUrl: signal.sourceUrl ?? null,
        sourceKind: signal.sourceKind ?? null,
      },
      place: isRecruitment ? placeOf(signal.location ?? null, signal.signal, signal.sales_implication ?? null) : null,
      role: mission?.role ?? null,
      ...linked(signal.signal, isRecruitment, mission, signal.location ?? null),
      origin: mission?.origin ?? 'signal',
      signal,
      ...(signal.offerCount ? { offerCount: signal.offerCount, offerPlaces: signal.offerPlaces ?? [] } : {}),
      ...(signal.seenCount && signal.seenCount > 1 ? { seenCount: signal.seenCount } : {}),
      implication: signal.sales_implication ?? null,
      derivedNeeds: [],
    }
    ;(isRecruitment ? recruitmentCards : vision).push(card)
  }

  // OFFRES-VEILLE (16/10) — « une offre = une carte » : une mission dont le fait EST l'offre d'un signal
  // d'emploi (même intitulé, à la graphie près) se range SOUS la carte de l'offre, avec son titre.
  const postings = recruitmentCards.filter(card => card.signal)
  for (const mission of [...missionsLeft]) {
    const fact = normalizeEventText(mission.basis.label)
    const host = fact
      ? postings.find(card => describesSameOffer(fact, normalizeEventText(card.basis.label)))
      : undefined
    if (!host) continue
    if (mission.title && !host.derivedNeeds.includes(mission.title)) host.derivedNeeds.push(mission.title)
    missionsLeft.splice(missionsLeft.indexOf(mission), 1)
  }

  // V4-CORRECTIFS-C 4294.6 (#4142.5) — le repli par intitulé que `BuyingSignals` appliquait déjà : deux offres au même
  // intitulé normalisé (dans deux villes) font UNE carte « N offres (villes) ». Le regroupement par équipe (②) ne le
  // remplaçait pas : il laissait chaque offre en double dans ①. Les besoins déduits se joignent à la carte gardée.
  const folded = new Map<string, OpportunityCard>()
  for (const card of [...recruitmentCards]) {
    if (!card.signal || card.origin !== 'signal') continue
    const key = offerTitleKey(card.basis.label)
    const host = key ? folded.get(key) : undefined
    if (!host) {
      if (key) folded.set(key, card)
      continue
    }
    const hostPlace = host.signal?.location?.trim()
    const places = host.offerPlaces ?? (hostPlace ? [hostPlace] : [])
    const place = card.signal.location?.trim()
    if (place && !places.includes(place)) places.push(place)
    host.offerCount = (host.offerCount ?? 1) + 1
    host.offerPlaces = places
    for (const need of card.derivedNeeds) if (!host.derivedNeeds.includes(need)) host.derivedNeeds.push(need)
    recruitmentCards.splice(recruitmentCards.indexOf(card), 1)
  }

  // Les missions sans signal correspondant gardent leur carte, rangées par la nature de leur fait.
  for (const mission of missionsLeft) {
    const isRecruitment =
      RECRUITMENT_TEXT.test(normalizeEventText(mission.basis.label)) || isJobSource(mission.basis.source)
    // #4329.1 (call refonte UX 19/10 — « trop de projets plausibles », 61 cartes ③ le 11/10) — une piste
    // NON confirmée sans signal correspondant ne fait pas de carte ③ : elle vit UNE fois, dans la file
    // « Projets possibles, à confirmer » (seuil de preuve, décisions, conversion). Un fait, un endroit.
    if (!isRecruitment && mission.origin === 'lead') continue
    const card: OpportunityCard = {
      key: mission.key,
      title: mission.title,
      basis: {
        label: mission.basis.label,
        source: mission.basis.source,
        date: isoDay(mission.basis.observed_on),
        sourceUrl: null,
        sourceKind: null,
      },
      place: isRecruitment ? placeOf(null, mission.basis.label) : null,
      role: mission.role,
      ...linked(mission.basis.label, isRecruitment, mission, null),
      origin: mission.origin,
      signal: null,
      implication: null,
      derivedNeeds: [],
    }
    ;(isRecruitment ? recruitmentCards : vision).push(card)
  }

  // #4294.6 — un poste dit deux fois (même intitulé, même lieu, non replié en « N offres ») : UNE carte « vu N fois ».
  const recruitmentSeen = new Map<string, OpportunityCard>()
  for (const card of [...recruitmentCards]) {
    if (card.offerCount) continue
    const key = `${normalizeEventText(card.basis.label)}|${normalizeEventText(card.place?.place ?? '')}`
    if (!normalizeEventText(card.basis.label)) continue
    const host = recruitmentSeen.get(key)
    if (!host) {
      recruitmentSeen.set(key, card)
      continue
    }
    host.seenCount = (host.seenCount ?? 1) + 1
    for (const need of card.derivedNeeds) if (!host.derivedNeeds.includes(need)) host.derivedNeeds.push(need)
    recruitmentCards.splice(recruitmentCards.indexOf(card), 1)
  }

  // #3901.6 — même prédicat que Découvrir et « Mes cibles » (GA-26) : jamais un second jugement « hors métier ».
  const isOther = (card: OpportunityCard) =>
    isOffDomainHiringSignal({ type: 'hiring', label: card.basis.label }, input.profile)
  const recruitment = recruitmentCards.filter(card => !isOther(card))
  const otherRecruitment = recruitmentCards.filter(isOther)
  // ② — les postes d'une même équipe se REGROUPENT en un résumé ; AUCUN poste ne quitte ① (Louis 11/10).
  // #4399.2 (recette prod 22/10 — Airbus : aucune section ; Schneider : 1 famille sur 16 offres) — la section
  // existe DÈS qu'une offre du métier existe : l'ancien seuil « 2 cartes » l'effaçait quand les offres d'un même
  // intitulé se replient en UNE carte (« N offres »), et une offre sans famille lue n'entrait dans aucun groupe.
  const byTeam = new Map<TeamKey | typeof OTHER_TEAM, OpportunityCard[]>()
  for (const card of recruitment) {
    if (card.origin !== 'signal') continue
    const key = teamKeyOf(card.basis.label) ?? OTHER_TEAM
    byTeam.set(key, [...(byTeam.get(key) ?? []), card])
  }
  const team: TeamNeedCard[] = []
  for (const [teamKey, postings] of byTeam) {
    const sorted = [...postings].sort(compareRecruitment)
    const contacts = uniqueContacts(sorted.flatMap(card => (card.contactsMatch === 'role' ? card.contacts : [])))
    team.push({
      key: `team-${teamKey}`,
      teamKey,
      postings: sorted,
      contacts: contacts.slice(0, CARD_CONTACTS_SHOWN),
      contactsMatch: contacts.length > 0 ? 'role' : 'none',
    })
  }
  team.sort(
    (left, right) =>
      Number(left.teamKey === OTHER_TEAM) - Number(right.teamKey === OTHER_TEAM) ||
      offersIn(right) - offersIn(left) ||
      PLACE_ORDER[bestPlace(left)] - PLACE_ORDER[bestPlace(right)],
  )

  // #4399.2 — Veolia : 2 équipes affichées, les autres postes ouverts nulle part. Ce que les équipes n'ont pas
  // pris (famille à un seul poste, ou sans famille) se regroupe par famille, sous elles.
  const grouped = new Set(team.flatMap(entry => entry.postings.map(posting => posting.key)))
  const byOtherFamily = new Map<TeamKey | 'other', OpportunityCard[]>()
  for (const card of [...recruitment].sort(compareRecruitment)) {
    if (grouped.has(card.key)) continue
    // #4399.2 (recette prod 23/10, Decathlon) — « Autres besoins » ne compte que des POSTES (offres). Une affaire ou
    // une mission rangée en recrutement n'est pas un poste : elle faisait un second « Autres métiers — N postes »
    // sous celui de « Besoins d'équipe ».
    if (card.origin !== 'signal') continue
    const family = teamKeyOf(card.basis.label) ?? 'other'
    byOtherFamily.set(family, [...(byOtherFamily.get(family) ?? []), card])
  }
  const otherNeeds: OtherNeedGroup[] = [...byOtherFamily].map(([family, postings]) => ({
    key: `other-${family}`,
    family,
    postings,
  }))
  otherNeeds.sort(
    (left, right) =>
      Number(left.family === 'other') - Number(right.family === 'other') ||
      right.postings.length - left.postings.length,
  )

  return {
    recruitment: recruitment.sort(compareRecruitment),
    otherRecruitment: otherRecruitment.sort(compareRecruitment),
    team,
    otherNeeds,
    vision: distinctFacts(vision.sort((left, right) => dateValue(right.basis.date) - dateValue(left.basis.date))),
  }
}

/** Le nombre d'OFFRES d'un groupe : une carte repliée « N offres » en compte N. */
export function offersIn(team: Pick<TeamNeedCard, 'postings'>): number {
  return team.postings.reduce((sum, posting) => sum + (posting.offerCount ?? 1), 0)
}

/** #4396.1 — le libellé d'une SOURCE d'offres (« Offres d'emploi · France »), sans intitulé de poste. */
function isGenericJobsLine(label: string): boolean {
  return /^offres? d emploi( publiees?)?( (en )?france)?$/.test(normalizeEventText(label))
}

/** Deux libellés normalisés qui désignent la même offre : égaux, ou l'un contient l'autre (« … (H/F) »). */
function describesSameOffer(left: string, right: string): boolean {
  if (!left || !right) return false
  if (left === right) return true
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  return short.length >= 12 && ` ${long} `.includes(` ${short} `)
}

/** #4294.6 — un libellé trop court (« Fait X ») ne se compare pas par similarité : seule l'égalité exacte regroupe. */
const hasEnoughWords = (label: string): boolean => normalizeEventText(label).split(' ').length >= 4

/**
 * #4022 — un signal et une mission qui disent le même texte ne font qu'une carte (la première, la plus riche).
 * #4294.6 — la carte gardée DIT combien de fois le fait a été vu (`seenCount`) : un doublon replié sans un mot était
 * indiscernable d'un fait absent. Un fait quasi identique (même prédicat que la liste « Pourquoi maintenant »,
 * GA-26) se regroupe de même ; deux dates connues et éloignées restent deux faits.
 */
function distinctFacts(cards: OpportunityCard[]): OpportunityCard[] {
  const seen = new Map<string, OpportunityCard>()
  const kept: OpportunityCard[] = []
  const countRepeat = (host: OpportunityCard) => {
    host.seenCount = (host.seenCount ?? 1) + 1
  }
  for (const card of cards) {
    // #3916 — le MÊME libellé à deux dates est deux faits quand c'est une annonce légale (le texte ne
    // dit pas la date, contrairement à un article de presse repris).
    const day = card.signal && isLegalNotice(card.signal) ? (card.basis.date ?? '') : ''
    const keys = [card.basis.label, card.title]
      .map(normalizeEventText)
      .filter(Boolean)
      .map(key => `${key}|${day}`)
    const exact = keys.map(key => seen.get(key)).find(Boolean)
    const near =
      exact ??
      (!hasEnoughWords(card.basis.label) || (card.signal && isLegalNotice(card.signal))
        ? undefined
        : kept.find(
            host =>
              hasEnoughWords(host.basis.label) &&
              !(host.signal && isLegalNotice(host.signal)) &&
              areNearDuplicateSignals(
                { text: host.basis.label, url: host.basis.sourceUrl, date: host.basis.date },
                { text: card.basis.label, url: card.basis.sourceUrl, date: card.basis.date },
              ),
          ))
    if (near) {
      countRepeat(near)
      for (const key of keys) seen.set(key, near)
      continue
    }
    for (const key of keys) seen.set(key, card)
    kept.push(card)
  }
  return kept
}

/** #3916 — une annonce légale (registre public) : son libellé est celui de sa famille, la date la distingue. */
function isLegalNotice(signal: WatchSignal): boolean {
  return (
    signal.sourceKind === 'bodacc' || signal.type === 'legal' || /\bbodacc\b/.test(normalizeEventText(signal.source))
  )
}

/** #4022.3 — une OFFRE D'EMPLOI se reconnaît à sa nature collectée (`job`) ou à sa source, pas seulement à
 *  la catégorie : un intitulé étranger (« B2B Sales Manager (x/f/m) im Außendienst ») n'est pas lu par les
 *  mots-clés, et finissait en « vision / transformation ». */
function isJobSignal(signal: WatchSignal): boolean {
  return signal.category === 'recrutement' || signal.sourceKind === 'job' || isJobSource(signal.source)
}

function isJobSource(source: string | null | undefined): boolean {
  return /\boffre d emploi\b/.test(normalizeEventText(source ?? ''))
}

/**
 * #4022.3 — un même article ne fait qu'UNE carte : même URL de source, ou même titre normalisé chez la même
 * source (le 12/10 un article franceinfo apparaissait trois fois). Le premier est gardé ; il reprend le lien
 * d'un doublon quand il n'en avait pas. Jamais deux faits distincts fondus : titre ET source identiques.
 */
function distinctArticles(signals: readonly WatchSignal[]): WatchSignal[] {
  const byUrl = new Map<string, number>()
  const byTitle = new Map<string, number>()
  const out: WatchSignal[] = []
  for (const signal of signals) {
    const url = signal.sourceUrl?.trim() || null
    // #4022 — un TEXTE de presse repris par deux sources reste un seul fait (recette prod 12/10) ; une OFFRE
    // se distingue par sa source et son lieu (deux villes = deux postes).
    const titleKey = isJobSignal(signal)
      ? `job|${normalizeEventText(signal.signal)}|${normalizeEventText(signal.source)}|${normalizeEventText(signal.location ?? '')}`
      : `${normalizeEventText(signal.signal)}${isLegalNotice(signal) ? `|${isoDay(signal.date) ?? ''}` : ''}`
    const seen = (url ? byUrl.get(url) : undefined) ?? byTitle.get(titleKey)
    if (seen === undefined) {
      const index = out.push(signal) - 1
      if (url) byUrl.set(url, index)
      byTitle.set(titleKey, index)
      continue
    }
    const kept = out[seen]
    // #4294.6 — le doublon replié se DIT : le signal gardé compte les fois où le fait a été vu.
    if (kept) out[seen] = { ...kept, seenCount: (kept.seenCount ?? 1) + (signal.seenCount ?? 1) }
    const counted = out[seen]
    if (counted && url && !counted.sourceUrl)
      out[seen] = { ...counted, sourceUrl: url, sourceKind: signal.sourceKind ?? counted.sourceKind }
    if (url) byUrl.set(url, seen)
    byTitle.set(titleKey, seen)
  }
  return out
}

const PLACE_ORDER: Record<PlaceRank, number> = { france: 0, unknown: 1, abroad: 2 }

function compareRecruitment(left: OpportunityCard, right: OpportunityCard): number {
  return (
    PLACE_ORDER[left.place?.rank ?? 'unknown'] - PLACE_ORDER[right.place?.rank ?? 'unknown'] ||
    namedOrder(left) - namedOrder(right) ||
    dateValue(right.basis.date) - dateValue(left.basis.date)
  )
}

function namedOrder(card: OpportunityCard): number {
  // Une personne liée d'abord, puis un contact proche du sujet (#4182.6), puis personne.
  return card.contactsMatch === 'role' ? 0 : card.contactsMatch === 'known' ? 1 : 2
}

function bestPlace(team: TeamNeedCard): PlaceRank {
  return team.postings[0]?.place?.rank ?? 'unknown'
}

const RECRUITMENT_TEXT = /\b(recrut\w*|embauch\w*|poste|postes|emploi|offre d emploi)\b/

function sameFact(mission: AccountMission, signal: WatchSignal): boolean {
  const label = normalizeEventText(mission.basis.label)
  if (!label || label !== normalizeEventText(signal.signal)) return false
  const source = normalizeEventText(mission.basis.source)
  return !source || normalizeEventText(signal.source).includes(source)
}

function linkedContacts(
  text: string,
  isRecruitment: boolean,
  mission: AccountMission | undefined,
  named: readonly MissionContact[],
  perimeter: AnalysisScopeSelection | undefined,
  location: string | null,
): { contacts: MissionContact[]; contactsMatch: 'role' | 'known' | 'none' } {
  if (mission && mission.contacts_match !== 'none')
    return { contacts: mission.contacts, contactsMatch: mission.contacts_match }
  // #4044 — la sélection par fait et par périmètre vit à UN endroit (`signal-contacts.ts`) : la
  // personne NOMMÉE dans le fait, un titre qui recoupe l'intitulé d'un poste, le lieu du poste.
  const { contacts, match } = proposeContactsForSignal({
    contacts: named,
    signal: { text, role: null, location, posting: isRecruitment },
    perimeter,
  })
  return { contacts, contactsMatch: match }
}

function uniqueContacts(contacts: readonly MissionContact[]): MissionContact[] {
  const seen = new Set<string>()
  return contacts.filter(contact => (seen.has(contact.id) ? false : (seen.add(contact.id), true)))
}

// ── Le lieu (#4020) ─────────────────────────────────────────────────────────────────────────────
// Lu, jamais deviné : le lieu COLLECTÉ de l'offre d'abord (`location`, posé par le collecteur
// d'offres d'emploi) ; sans lui, un lieu EXPLICITE dans l'intitulé (« … - London »). Un nom
// étranger l'emporte sur un code postal (« 10115 Berlin ») ; rien de reconnu = lieu non précisé.

/** Pays et villes étrangers ; « vienne » (département français) et « valence » en sont exclus. */
const ABROAD_WORDS = [
  'germany',
  'deutschland',
  'allemagne',
  'spain',
  'espana',
  'espagne',
  'italy',
  'italia',
  'italie',
  'united kingdom',
  'royaume uni',
  'england',
  'angleterre',
  'scotland',
  'ireland',
  'irlande',
  'netherlands',
  'pays bas',
  'nederland',
  'belgium',
  'belgique',
  'belgie',
  'switzerland',
  'suisse',
  'schweiz',
  'luxembourg',
  'portugal',
  'poland',
  'pologne',
  'austria',
  'autriche',
  'osterreich',
  'sweden',
  'suede',
  'denmark',
  'danemark',
  'norway',
  'norvege',
  'finland',
  'finlande',
  'usa',
  'united states',
  'etats unis',
  'canada',
  'india',
  'inde',
  'morocco',
  'maroc',
  'tunisia',
  'tunisie',
  'romania',
  'roumanie',
  'czech republic',
  'czechia',
  'republique tcheque',
  'singapore',
  'singapour',
  'japan',
  'japon',
  'china',
  'chine',
  'australia',
  'australie',
  'brazil',
  'bresil',
  'mexico',
  'mexique',
  'dubai',
  'united arab emirates',
  'israel',
  'estonia',
  'ukraine',
  'greece',
  'grece',
  'berlin',
  'munich',
  'munchen',
  'hamburg',
  'frankfurt',
  'koln',
  'london',
  'londres',
  'manchester',
  'dublin',
  'amsterdam',
  'rotterdam',
  'brussels',
  'bruxelles',
  'antwerp',
  'anvers',
  'geneva',
  'geneve',
  'zurich',
  'lausanne',
  'basel',
  'bale',
  'barcelona',
  'barcelone',
  'madrid',
  'lisbon',
  'lisbonne',
  'milan',
  'milano',
  'roma',
  'warsaw',
  'varsovie',
  'krakow',
  'prague',
  'wien',
  'stockholm',
  'copenhagen',
  'copenhague',
  'oslo',
  'helsinki',
  'new york',
  'san francisco',
  'boston',
  'montreal',
  'toronto',
  'bangalore',
  'bengaluru',
  'casablanca',
  'tunis',
  'bucharest',
  'bucarest',
  'tokyo',
  'sydney',
]
/** Deux lettres : seulement dans un lieu collecté, jamais lues dans un intitulé. */
const ABROAD_CODES_IN_LOCATION = ['uk', 'us']

const FRANCE_WORDS = [
  'france',
  'ile de france',
  'idf',
  'paris',
  'lyon',
  'marseille',
  'toulouse',
  'nantes',
  'strasbourg',
  'montpellier',
  'bordeaux',
  'lille',
  'villeneuve d ascq',
  'roubaix',
  'tourcoing',
  'marcq en baroeul',
  'lambersart',
  'wasquehal',
  'lesquin',
  'rennes',
  'reims',
  'grenoble',
  'dijon',
  'angers',
  'nimes',
  'clermont ferrand',
  'aix en provence',
  'brest',
  'limoges',
  'amiens',
  'metz',
  'besancon',
  'perpignan',
  'orleans',
  'rouen',
  'caen',
  'nancy',
  'sophia antipolis',
  'la defense',
  'courbevoie',
  'puteaux',
  'issy les moulineaux',
  'boulogne billancourt',
  'levallois perret',
  'nanterre',
  'saint denis',
  'massy',
  'velizy',
  'guyancourt',
  'niort',
  'annecy',
  'la rochelle',
  'mulhouse',
  'toulon',
  'le havre',
  'saint etienne',
  'villeurbanne',
  'auvergne',
  'bretagne',
  'normandie',
  'occitanie',
  'nouvelle aquitaine',
  'hauts de france',
  'grand est',
  'provence',
  'pays de la loire',
  'centre val de loire',
  'bourgogne',
  'corse',
]
/** Villes françaises aux noms ambigus (« Nice », « Tours ») : seulement dans un lieu collecté. */
const FRANCE_WORDS_IN_LOCATION = ['nice', 'tours', 'pau', 'vienne', 'valence']

/**
 * OFFRES-VEILLE (16/10) — « lieu non précisé » alors que le TEXTE de l'offre cite sa ville (Decathlon,
 * Villeneuve-d'Ascq). Le lieu collecté prime ; sinon on lit le texte de l'offre (intitulé, puis ce que l'analyse
 * en dit) contre la liste FERMÉE de communes et de pays, ou un code postal français — jamais une ville devinée.
 */
export function placeOf(location: string | null, label: string, offerText: string | null = null): CardPlace {
  const fromLabel = placeFromText(location, label)
  if (fromLabel.rank !== 'unknown' || location?.trim() || !offerText) return fromLabel
  return placeFromText(null, offerText)
}

function placeFromText(location: string | null, label: string): CardPlace {
  const collected = location?.trim() || null
  if (collected) {
    const text = ` ${normalizeEventText(collected)} `
    if (hasAny(text, ABROAD_WORDS) || hasAny(text, ABROAD_CODES_IN_LOCATION))
      return { rank: 'abroad', place: collected }
    if (
      hasAny(text, FRANCE_WORDS) ||
      hasAny(text, FRANCE_WORDS_IN_LOCATION) ||
      /^\s*(\d{2}|2a|2b|97\d)\s*-\s/i.test(collected) ||
      /\b\d{5}\b/.test(collected)
    )
      return { rank: 'france', place: collected }
    return { rank: 'unknown', place: collected }
  }
  const text = ` ${normalizeEventText(label)} `
  const abroad = ABROAD_WORDS.find(word => text.includes(` ${word} `))
  if (abroad) return { rank: 'abroad', place: null }
  const france = FRANCE_WORDS.find(word => text.includes(` ${word} `))
  if (france) return { rank: 'france', place: null }
  // Un code postal français cité dans le texte (hors pays étranger ci-dessus) est un lieu lu, pas deviné.
  if (/(?:^|[^\d])(?:0[1-9]|[1-8]\d|9[0-5]|97\d)\d{3}(?!\d)/.test(label)) return { rank: 'france', place: null }
  return { rank: 'unknown', place: null }
}

function hasAny(paddedText: string, words: readonly string[]): boolean {
  return words.some(word => paddedText.includes(` ${word} `))
}

// ── L'équipe / la techno d'un poste (②) ────────────────────────────────────────────────────────

/**
 * Ordre = priorité : « Data engineer GCP » est un poste data avant d'être un poste cloud, « Analyste cybersécurité »
 * un poste sécurité avant d'être un poste data. #4399 (recette 21/10) : élargi aux familles courantes d'une ESN —
 * dev, ERP, projet / PMO, support / IT ops, test / QA, réseau / télécom, industrie / ingénierie. Seuil inchangé :
 * deux postes minimum pour former un groupe.
 */
const TEAM_FAMILIES = [
  ['security', ['securite', 'security', 'cyber', 'cybersecurite', 'soc', 'pentest', 'rssi', 'devsecops']],
  ['data', ['data', 'bi', 'analytics', 'analyste', 'analyst', 'machine learning', 'ml', 'ia', 'ai', 'llm']],
  [
    'cloud',
    [
      'devops',
      'sre',
      'cloud',
      'kubernetes',
      'aws',
      'azure',
      'gcp',
      'platform',
      'plateforme',
      'infrastructure',
      'infra',
      'sysadmin',
      'linux',
      'finops',
    ],
  ],
  ['sap', ['sap']],
  ['erp', ['erp', 'oracle', 'dynamics', 'sage', 'odoo']],
  ['salesforce', ['salesforce']],
  ['java', ['java', 'spring']],
  ['dotnet', ['net', 'dotnet', 'csharp']],
  ['frontend', ['front', 'frontend', 'react', 'angular', 'vue', 'ui']],
  ['mobile', ['mobile', 'ios', 'android', 'flutter']],
  ['backend', ['backend', 'back', 'python', 'golang', 'node', 'nodejs', 'php', 'ruby']],
  ['dev', ['developpeur', 'developpeuse', 'developer', 'dev', 'software', 'logiciel', 'fullstack', 'full stack']],
  ['qa', ['qa', 'test', 'testeur', 'tests', 'quality', 'recette']],
  ['network', ['reseau', 'reseaux', 'network', 'telecom', 'telecoms', 'fibre', '5g']],
  ['product', ['product', 'produit', 'po', 'ux']],
  ['sales', ['sales', 'commercial', 'commerciale', 'vente', 'ventes', 'business developer', 'bdr', 'sdr']],
  ['cs', ['customer success', 'csm', 'cs', 'support client', 'service client']],
  ['project', ['projet', 'project', 'pmo', 'scrum', 'amoa', 'agile']],
  ['support', ['support', 'helpdesk', 'exploitation', 'service desk', 'it ops', 'itops']],
  [
    'industry',
    [
      'industrie',
      'industriel',
      'industrielle',
      'process',
      'automaticien',
      'automatisme',
      'maintenance',
      'mecanique',
      'electrotechnicien',
      'electrotechnique',
      'hse',
      'production',
      'usine',
      'genie civil',
      'bureau d etudes',
    ],
  ],
] as const

type TeamKey = (typeof TEAM_FAMILIES)[number][0]
const OTHER_TEAM = 'other'

export function teamKeyOf(title: string): TeamKey | null {
  const text = ` ${normalizeEventText(title)} `
  for (const [key, words] of TEAM_FAMILIES) {
    if (words.some(word => text.includes(` ${word} `))) return key
  }
  return null
}

const FRENCH_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/**
 * #3917.r42 — l'analyse pose parfois la date en TEXTE (« 12 octobre 2026 ») : un jour exact, lu tel quel.
 * Un texte sans jour exact (« mars 2026 », « Non datée », « il y a une semaine ») reste `null` : jamais inventé.
 */
function isoDay(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(text)
  if (iso) return iso[0]
  const french = /^(\d{1,2})(?:er)?\s+([a-zéûè]+)\s+(\d{4})(?!\d)/i.exec(text)
  if (!french) return null
  const month = FRENCH_MONTHS.indexOf(french[2]!.toLowerCase()) + 1
  const day = Number(french[1])
  if (month === 0 || day < 1 || day > 31) return null
  return `${french[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateValue(value: string | null): number {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isNaN(time) ? 0 : time
}
