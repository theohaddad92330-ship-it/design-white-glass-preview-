// ── LA hiérarchie des faits d'une carte Découvrir (#4068, lot DECOUVRIR-CARTE) ──
// Décisions Louis 13/10 (retour sur LATECOERE : « trop de signaux qui servent à
// rien », trois fois le même chiffre d'affaires, des actes de capital vieux de
// 249 j, « 0 recrutement » à côté de « 13 besoins connus ») :
//
//   - FORT (5 au plus, en haut de la carte) : recrutement hors stage, besoin
//     (appel d'offres, besoin connu de l'espace), projet / transformation /
//     programme, nomination ou départ d'un décideur, contrat / attribution /
//     levée, fait de l'historique de l'espace ;
//   - CONTEXTE (10 au plus, dans le détail déplié) : actualité économique
//     substantielle, salon / événement, résultat financier, technologie,
//     alternance / apprentissage (visible, jamais fort, aucun plafond propre) ;
//   - HORS CARTE (reste au dossier) : acte juridique administratif (capital,
//     « modifications diverses », administration sans décideur nommé, dépôt des
//     comptes…), titre sans contenu, fait de plus de 180 j — sauf l'historique
//     de l'espace, qui ne périme pas sur la carte.
//
// UN seul endroit décide (GA-26). Jumeau Python : `classify_card_fact`
// (apps/ia/app/services/discover_card_facts.py) — l'IA y lit ce qu'elle ne
// compte plus dans le rang ; les deux lisent le MÊME jeu de cas,
// `fixtures/discover-card-facts.json`. Aucune source n'est jamais nommée : la
// carte dit la NATURE du fait (#4068.4).

import { isInternshipPosting } from './internship-posting.js'

export const DISCOVER_CARD_STRONG_MAX = 5
export const DISCOVER_CARD_CONTEXT_MAX = 10
/** Au-delà, un fait collecté sort de la carte (il reste au dossier). */
export const DISCOVER_CARD_MAX_AGE_DAYS = 180
/** Deux sources du même fait le datent rarement au même jour. */
export const DISCOVER_CARD_DUPLICATE_WINDOW_DAYS = 7
/** G-FIX #4294.10 — mots du titre à partager, avec le même chiffre, pour fondre deux natures différentes. */
const DISCOVER_CARD_TWIN_SHARED_WORDS = 3

export type DiscoverCardNature =
  | 'hiring'
  | 'work_study'
  | 'need'
  | 'project'
  | 'leader'
  | 'deal'
  | 'space'
  | 'economy'
  | 'event'
  | 'financial'
  | 'tech'
export type DiscoverCardTier = 'strong' | 'context' | 'off'
export type DiscoverCardOffReason = 'internship' | 'legal_admin' | 'contentless' | 'too_old'

export type DiscoverCardFactInput = {
  /** La famille du signal (`hiring`, `tender`, `award`, `legal`, `tech`, `business`, `funding`). */
  type: string
  label: string
  /** ISO. */
  date: string
  url?: string
  contractType?: string
  /** Fait que l'espace détient déjà (historique, CRM, missions, documents, besoins connus). */
  fromSpace?: boolean
  /** Nature déjà connue de l'appelant (un besoin connu, une affaire du CRM) : elle prime. */
  nature?: DiscoverCardNature
}

export type DiscoverCardVerdict =
  | { tier: 'strong' | 'context'; nature: DiscoverCardNature; reason?: undefined }
  | { tier: 'off'; nature?: undefined; reason: DiscoverCardOffReason }

const STRONG_NATURES: ReadonlySet<DiscoverCardNature> = new Set([
  'hiring',
  'need',
  'project',
  'leader',
  'deal',
  'space',
])

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase()
}

const LEADER_EVENT =
  /(nomm|nomination|rejoint|arrivee|depart|quitte|succede|prend la tete|promu|nouvel(le)? (directeur|directrice|president|presidente|dg|ceo|cio|cto|dsi))/
const LEADER_ROLE =
  /\b(pdg|president|presidente|directeur|directrice|dg|ceo|cio|cto|cfo|coo|dsi|chief|head of|vp|vice-president|responsable|gerant)\b/
const LEGAL_ADMIN =
  /(capital|modifications? diverses|administrat|changement de dirigeant|depot des comptes|comptes annuels|siege social|transfert du siege|denomination|statuts|forme juridique|objet social|commissaire aux comptes|immatriculation|radiation)/
const LEGAL_SUBSTANTIVE =
  /(cession|vente|fusion|procedure collective|sauvegarde|redressement|liquidation|acquisition|rachat)/
// #4045.1 (recette prod 14/10) — « levée, nomination, rachat, déménagement » cités par
// l'utilisateur comme exemples de « vie de l'entreprise » : un rachat/une acquisition annoncé par
// la PRESSE (type `business`) ne matchait aucune des cinq natures nommées plus haut et retombait
// en `economy` (contexte, masqué par défaut) — le même poids qu'un article générique sur la
// filière. Le canal LÉGAL (BODACC, `LEGAL_SUBSTANTIVE`) garde son propre arbitrage, inchangé.
// #4285.1 — l'augmentation de capital BODACC d'une société (fait de carte, libellé EXACT du signal serveur,
// jumeau de `_CAPITAL_INCREASE`) : de la vie de l'entreprise, pas un acte administratif. Contexte, jamais fort.
const CAPITAL_INCREASE = /^augmentation de capital$/
const DEAL =
  /(contrat|remporte|attribu|marche public|accord-cadre|accord cadre|levee de fonds|leve \d|appel d'offres|commande de|rachat|rachet|acqui)/
const PROJECT =
  /(programme|projet|transformation|migration|deploiement|modernisation|refonte|digitalisation|plan strategique|nouvelle usine|lance )/
// #4045.6 — « déménagement » (exemple de Louis) : un fait FORT, rangé sous `project` (pas de
// nouvelle nature : aucun libellé à créer). Lu sur la PRESSE seulement ; un acte du canal légal
// (« transfert du siège ») garde son arbitrage administratif, inchangé.
const MOVE = /(demenag|emmenag|nouveau siege|nouveaux locaux|nouveau campus|nouvelle implantation)/
const HIRING_WORDS = /(recrute|recrutement|embauche|postes? a pourvoir|offres? d'emploi)/
const EVENT = /(salon|forum|congres|conference|evenement|exposition|bourget|webinaire|summit|meetup)/
const FINANCIAL =
  /(chiffre d'affaires|\bca\b|resultat|benefice|ebitda|\bebit\b|marge|semestr|trimestr|\bs[12]\b|\bt[1-4]\b|perte nette|exercice|carnet de commandes)/

const STOPWORDS = new Set(
  (
    'les des du une et en au aux pour par sur dans avec quelles quel quels quelle que qui quoi est sont son ses sa ' +
    'leur leurs ce cette ces plus moins vers chez apres avant entre comme mais donc'
  ).split(' '),
)

function tokens(label: string, companyName?: string): string[] {
  const company = new Set(companyName ? fold(companyName).split(/[^a-z0-9]+/) : [])
  return fold(label)
    .split(/[^a-z0-9]+/)
    .filter(word => word !== '' && !company.has(word) && !STOPWORDS.has(word))
    .filter(word => word.length >= 3 || /\d/.test(word))
}

/** Un titre qui ne dit rien : un nom de journal, le nom de l'entreprise, une question sans chiffre. */
function isContentless(label: string, companyName?: string): boolean {
  if (tokens(label, companyName).length < 2) return true
  const trimmed = label.trim()
  return trimmed.endsWith('?') && !/\d/.test(trimmed)
}

function ageInDays(date: string, now: Date): number | null {
  const parsed = Date.parse(date)
  if (Number.isNaN(parsed)) return null
  // Jours entiers, comme le jumeau Python (`date` contre `date`).
  return Math.floor((now.getTime() - parsed) / 86_400_000)
}

function tierOf(nature: DiscoverCardNature): 'strong' | 'context' {
  return STRONG_NATURES.has(nature) ? 'strong' : 'context'
}

function isLeader(text: string): boolean {
  return LEADER_EVENT.test(text) && LEADER_ROLE.test(text)
}

// #4115 (Louis 13/10) — alternance / apprentissage : visible, JAMAIS un signal fort. Jumeau de
// `_WORK_STUDY_RE` (apps/ia/app/services/discover_signal_grid.py) ; même jeu de cas partagé.
const WORK_STUDY = /alternan|apprenti|apprentissage|work[- ]?study/

function isWorkStudyPosting(label: string, contractType?: string): boolean {
  return WORK_STUDY.test(fold(`${label} ${contractType ?? ''}`))
}

/** La nature d'un fait de presse ou d'actualité, lue sur son texte. */
function newsNature(text: string): DiscoverCardNature {
  if (DEAL.test(text)) return 'deal'
  if (PROJECT.test(text)) return 'project'
  if (HIRING_WORDS.test(text)) return 'hiring'
  if (EVENT.test(text)) return 'event'
  if (FINANCIAL.test(text)) return 'financial'
  return 'economy'
}

/** `null` = hors carte, avec sa raison ; sinon la nature (sans regarder l'âge). */
function natureOf(fact: DiscoverCardFactInput, companyName?: string): DiscoverCardNature | DiscoverCardOffReason {
  if (fact.nature) return fact.nature
  const text = fold(fact.label)
  switch (fact.type) {
    case 'hiring':
      if (isInternshipPosting(fact.label, fact.contractType)) return 'internship'
      return isWorkStudyPosting(fact.label, fact.contractType) ? 'work_study' : 'hiring'
    case 'tender':
      return 'need'
    case 'award':
    case 'funding':
      return 'deal'
    case 'tech':
      return isContentless(fact.label, companyName) ? 'contentless' : 'tech'
    case 'legal':
      if (isLeader(text)) return 'leader'
      return LEGAL_SUBSTANTIVE.test(text) ? 'economy' : 'legal_admin'
    default:
      if (isLeader(text)) return 'leader'
      if (MOVE.test(text)) return 'project'
      if (CAPITAL_INCREASE.test(text.trim())) return 'economy'
      if (LEGAL_ADMIN.test(text)) return 'legal_admin'
      if (isContentless(fact.label, companyName)) return 'contentless'
      return newsNature(text)
  }
}

const OFF_REASONS: ReadonlySet<string> = new Set(['internship', 'legal_admin', 'contentless'])

/**
 * #4068 — fort, contexte ou hors carte. Un fait de l'espace (`fromSpace`) ne
 * périme pas ; il reste soumis aux autres règles (un acte de capital historisé
 * n'en devient pas un signal).
 */
export function classifyCardFact(
  fact: DiscoverCardFactInput,
  options: { now: Date; companyName?: string },
): DiscoverCardVerdict {
  const nature = natureOf(fact, options.companyName)
  if (OFF_REASONS.has(nature)) return { tier: 'off', reason: nature as DiscoverCardOffReason }
  if (!fact.fromSpace) {
    const age = ageInDays(fact.date, options.now)
    if (age === null || age > DISCOVER_CARD_MAX_AGE_DAYS) return { tier: 'off', reason: 'too_old' }
  }
  const kept = nature as DiscoverCardNature
  return { tier: tierOf(kept), nature: kept }
}

const YEAR = /^(19|20)\d\d$/

/**
 * #4068.4 — le MÊME fait repris par plusieurs sources : datés à quelques jours
 * près ET un contenu proche (mots en commun), ou — hors recrutement, où deux
 * offres voisines sont deux postes — la même nature et le même chiffre
 * (« +15 % » n'est pas une coïncidence).
 */
export function isSameCardFact(a: DiscoverCardFactInput, b: DiscoverCardFactInput, companyName?: string): boolean {
  const da = Date.parse(a.date)
  const db = Date.parse(b.date)
  if (Number.isNaN(da) || Number.isNaN(db)) return false
  if (Math.abs(da - db) / 86_400_000 > DISCOVER_CARD_DUPLICATE_WINDOW_DAYS) return false
  const ta = new Set(tokens(a.label, companyName))
  const tb = new Set(tokens(b.label, companyName))
  const shared = [...ta].filter(word => tb.has(word))
  const union = new Set([...ta, ...tb]).size
  if (union > 0 && shared.length / union >= 0.7) return true
  const na = natureOf(a, companyName)
  const nb = natureOf(b, companyName)
  const hiringLike = (nature: typeof na) => nature === 'hiring' || nature === 'work_study'
  if (hiringLike(na) || hiringLike(nb)) return false
  const sharedFigure = shared.some(word => /^\d+$/.test(word) && !YEAR.test(word))
  if (!sharedFigure) return false
  // G-FIX #4294.10 — la 2e source range parfois le même fait sous une autre nature (« après 20 % de baisse » :
  // rachat d'un côté, économie de l'autre) : le chiffre ET au moins trois mots du titre en commun suffisent.
  const sharedWords = shared.filter(word => !/^\d+$/.test(word)).length
  return na === nb || sharedWords >= DISCOVER_CARD_TWIN_SHARED_WORDS
}

export type DiscoverCardFact<T extends DiscoverCardFactInput> = T & { nature: DiscoverCardNature }

function byDateDesc<T extends { date: string }>(a: T, b: T): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
}

/** Remplace le dernier fort non protégé par le plus récent de `nature`, s'il manque. */
function ensureNature<T extends DiscoverCardFactInput>(
  top: DiscoverCardFact<T>[],
  pool: readonly DiscoverCardFact<T>[],
  nature: DiscoverCardNature,
  protectedNatures: readonly DiscoverCardNature[],
): DiscoverCardFact<T>[] {
  if (top.some(fact => fact.nature === nature)) return top
  const wanted = pool.find(fact => fact.nature === nature)
  if (!wanted) return top
  const index = top.map(fact => protectedNatures.includes(fact.nature)).lastIndexOf(false)
  if (index < 0) return top
  return [...top.slice(0, index), ...top.slice(index + 1), wanted].sort(byDateDesc)
}

/**
 * #4067 (reste) — la variété : une nature forte présente dans le fond mais absente du haut prend la
 * place du fait le plus ancien de la nature la plus répétée — à condition que celle-ci en compte au
 * moins deux. Le seul fait d'une nature n'est donc jamais retiré, et le recrutement (ensuré plus haut)
 * reste ; rien n'est inventé : seul ce que le fond contient entre. Du plus récent au plus ancien.
 */
function diversify<T extends DiscoverCardFactInput>(
  top: DiscoverCardFact<T>[],
  pool: readonly DiscoverCardFact<T>[],
): DiscoverCardFact<T>[] {
  let out = top
  for (const candidate of pool) {
    if (out.some(fact => fact.nature === candidate.nature)) continue
    const counts = new Map<DiscoverCardNature, number>()
    for (const fact of out) counts.set(fact.nature, (counts.get(fact.nature) ?? 0) + 1)
    const [crowded, size] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (!crowded || (size ?? 0) < 2) break
    const victim = out.map(fact => fact.nature).lastIndexOf(crowded)
    out = [...out.slice(0, victim), ...out.slice(victim + 1), candidate].sort(byDateDesc)
  }
  return out
}

/** #4067.9 (R47) — au plus ce nombre de recrutements sur une carte dès qu'une autre nature existe. */
export const DISCOVER_CARD_HIRING_MAX = 2

/**
 * #4067.9 (R47) — 7 cartes sur 10 ne portaient QUE des faits « RECRUTEMENT » alors que d'autres
 * natures datées existaient. Dès qu'un fait d'une autre nature existe pour le compte (fort ou de
 * contexte ; l'alternance n'en est pas une), le recrutement est plafonné et les places libérées vont
 * aux forts d'autres natures, en commençant par ceux dont la nature manque encore. Rien n'est
 * inventé : si le fond n'a rien d'autre, la carte compte moins de faits — et sans autre nature, le
 * recrutement reste entier.
 */
function capHiring<T extends DiscoverCardFactInput>(
  top: DiscoverCardFact<T>[],
  pool: readonly DiscoverCardFact<T>[],
  othersExist: boolean,
): DiscoverCardFact<T>[] {
  if (!othersExist) return top
  const hirings = top.filter(fact => fact.nature === 'hiring')
  if (hirings.length <= DISCOVER_CARD_HIRING_MAX) return top
  const kept = [...hirings.slice(0, DISCOVER_CARD_HIRING_MAX), ...top.filter(fact => fact.nature !== 'hiring')]
  const freed = DISCOVER_CARD_STRONG_MAX - kept.length
  const spare = pool.filter(fact => fact.nature !== 'hiring' && !kept.includes(fact))
  const unseen = spare.filter(fact => !kept.some(other => other.nature === fact.nature))
  const refill = [...unseen, ...spare.filter(fact => !unseen.includes(fact))].slice(0, Math.max(0, freed))
  return [...kept, ...refill].sort(byDateDesc)
}

/**
 * #4068 — LA sélection d'une carte : hors carte écarté, doublons fondus (la
 * ligne garde un lien), 5 forts du plus récent au plus ancien — dont, s'il en
 * existe, le recrutement et le besoin les plus récents (« N besoins connus »
 * n'est jamais seul) — puis 10 faits de contexte. Le reste n'est pas sur la
 * carte. Un fait n'apparaît jamais deux fois.
 */
export function selectCardFacts<T extends DiscoverCardFactInput>(
  facts: readonly T[],
  options: { now: Date; companyName?: string },
): { strong: DiscoverCardFact<T>[]; context: DiscoverCardFact<T>[] } {
  const kept: DiscoverCardFact<T>[] = []
  for (const fact of [...facts].sort(byDateDesc)) {
    const verdict = classifyCardFact(fact, options)
    if (verdict.tier === 'off') continue
    const twin = kept.findIndex(other => isSameCardFact(other, fact, options.companyName))
    if (twin >= 0) {
      const existing = kept[twin]
      if (existing) {
        // G-FIX #4294.10 — un fait vu deux fois garde un lien ET la date de sa PREMIÈRE vue (la plus ancienne).
        kept[twin] = {
          ...existing,
          ...(!existing.url && fact.url ? { url: fact.url } : {}),
          ...(fact.date < existing.date ? { date: fact.date } : {}),
        }
      }
      continue
    }
    kept.push({ ...fact, nature: verdict.nature })
  }
  const strongPool = kept.filter(fact => tierOf(fact.nature) === 'strong')
  let strong = strongPool.slice(0, DISCOVER_CARD_STRONG_MAX)
  strong = ensureNature(strong, strongPool, 'hiring', [])
  strong = ensureNature(strong, strongPool, 'need', ['hiring'])
  strong = diversify(strong, strongPool)
  strong = capHiring(
    strong,
    strongPool,
    kept.some(fact => fact.nature !== 'hiring' && fact.nature !== 'work_study'),
  )
  const context = kept.filter(fact => tierOf(fact.nature) === 'context').slice(0, DISCOVER_CARD_CONTEXT_MAX)
  return { strong, context }
}
