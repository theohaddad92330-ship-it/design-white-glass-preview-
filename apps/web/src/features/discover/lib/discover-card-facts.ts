import {
  decisiveSourceAxes,
  selectCardFacts,
  type DiscoverCardFact,
  type DiscoverCardFactInput,
  type DiscoverSourceAxis,
  type SalesProfileForRelevance,
} from '@bellum/contracts'
import { isOutOfTradeHiring } from './discover-hiring-domain'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

/**
 * #4068 (lot DECOUVRIR-CARTE, Louis 13/10) — LES FAITS D'UNE CARTE, déjà triés
 * par le contrat (`selectCardFacts`, un seul endroit décide, GA-26) :
 *
 * - les signaux du candidat (recherche + historique de l'espace) ;
 * - ses besoins connus EUX-MÊMES (`knownNeeds`) — « N besoins connus » n'est
 *   plus jamais seul sur la carte ;
 * - les sources décisives de l'espace qui portent une date (affaire, missions,
 *   documents, historique) : elles concourent aux MÊMES places, sous leur
 *   NATURE (« Déjà connu »), jamais sous le nom d'un système.
 *
 * Une source sans date (le référentiel) n'est pas un fait daté : elle reste au
 * score détaillé, pas dans la liste.
 */
type CardFactInput = DiscoverCardFactInput &
  Pick<DiscoverSignal, 'type' | 'stillOpen' | 'dateIsDetection' | 'requester' | 'technologies' | 'jobFamily'> & {
    /** Clé de rendu stable. */
    key: string
  }
export type CardFact = DiscoverCardFact<CardFactInput>

function cappedAtToday(iso: string, now: Date): string {
  const day = iso.slice(0, 10)
  const today = now.toISOString().slice(0, 10)
  return day > today ? today : day
}

export function candidateCardFacts(
  candidate: Pick<DiscoverCandidate, 'name' | 'signals' | 'knownNeeds' | 'sourceAxes'>,
  options: { now?: Date; spaceLabel: (axis: DiscoverSourceAxis) => string },
): { strong: CardFact[]; context: CardFact[] } {
  const inputs: CardFactInput[] = [
    // Un signal sans libellé ou sans date n'est pas un fait (la normalisation les écarte déjà).
    ...candidate.signals
      .filter(signal => typeof signal.label === 'string' && typeof signal.date === 'string')
      .map((signal, index) => ({
        key: `signal-${index}`,
        type: signal.type,
        label: signal.label,
        date: signal.date,
        ...(signal.url ? { url: signal.url } : {}),
        ...(signal.stillOpen !== undefined ? { stillOpen: signal.stillOpen } : {}),
        ...(signal.dateIsDetection ? { dateIsDetection: true } : {}),
        ...(signal.fromSpace ? { fromSpace: true } : {}),
        // #4182 — l'équipe demandeuse suit l'offre jusqu'à la carte (elle n'était rendue que sur la vue « besoins »).
        ...(signal.requester ? { requester: signal.requester } : {}),
        // #4437.5 — la compétence et la famille déduites de l'intitulé (même libre) suivent l'offre jusqu'à la carte.
        ...(signal.technologies?.length ? { technologies: signal.technologies } : {}),
        ...(signal.jobFamily ? { jobFamily: signal.jobFamily } : {}),
        // #5000.2 — le contrat DÉCLARÉ de l'offre suit jusqu'à la carte (déjà porté par le signal, jamais déduit du titre).
        ...(signal.contractType ? { contractType: signal.contractType } : {}),
      })),
    ...(candidate.knownNeeds ?? []).map((need, index) => ({
      key: `need-${index}`,
      type: 'tender' as const,
      label: need.label,
      date: need.date,
      nature: 'need' as const,
      fromSpace: true,
      ...(need.dateIsDetection ? { dateIsDetection: true } : {}),
    })),
    ...decisiveSourceAxes(candidate.sourceAxes)
      .filter(axis => axis.latestAt !== null)
      .map(axis => ({
        key: `space-${axis.key}`,
        type: 'business' as const,
        label: options.spaceLabel(axis),
        // #4067.4 (18/10) — la fin PRÉVUE d'une mission ouverte est dans le futur : un fait « déjà connu » se date
        // de son observation (aujourd'hui au plus tard), jamais d'une date à venir présentée comme un fait passé.
        date: cappedAtToday(axis.latestAt ?? '', options.now ?? new Date()),
        nature: 'space' as const,
        fromSpace: true,
      })),
  ]
  return selectCardFacts(inputs, { now: options.now ?? new Date(), companyName: candidate.name })
}

/** #4045.5 — les trois familles d'une carte, dans l'ordre où elles se lisent. */
type CardFactFamily = 'hiring' | 'project' | 'public_market'
const CARD_FACT_FAMILY_ORDER: readonly CardFactFamily[] = ['hiring', 'project', 'public_market']

/**
 * La famille d'un fait de carte (Louis 15/10/2026) : Recrutements (la nature `hiring`), Marchés publics (un
 * appel d'offres ou une attribution — type `tender`/`award`), Projets (tout le reste : projet, levée, nomination,
 * presse, ce que l'espace sait déjà). Un BESOIN connu porte le type `tender` mais n'est pas un marché public : sa
 * nature prime. Une dérivation, à un seul endroit (GA-26).
 */
export function cardFactFamilyOf(fact: Pick<CardFact, 'type' | 'nature'>): CardFactFamily {
  if (fact.nature === 'hiring' || fact.nature === 'work_study') return 'hiring'
  if (fact.nature !== 'need' && (fact.type === 'tender' || fact.type === 'award')) return 'public_market'
  return 'project'
}

/** Les faits rangés par famille — l'ordre interne (du plus récent au plus ancien) et les plafonds viennent du contrat. */
export function groupCardFactsByFamily(facts: readonly CardFact[]): { family: CardFactFamily; facts: CardFact[] }[] {
  return CARD_FACT_FAMILY_ORDER.map(family => ({
    family,
    facts: facts.filter(fact => cardFactFamilyOf(fact) === family),
  })).filter(group => group.facts.length > 0)
}

/**
 * #4284.1 — le fait est-il une offre HORS du métier de l'ESN ? Le MÊME prédicat que /mes-cibles, la fiche compte et
 * la ligne de fait (`isOutOfTradeHiring`, GA-26) ; profil non lu ⇒ `false` sauf poste que nulle ESN ne place.
 */
export function isOutOfTradeFact(
  fact: Pick<CardFact, 'type' | 'label'>,
  profile: SalesProfileForRelevance | undefined,
): boolean {
  return fact.type === 'hiring' && isOutOfTradeHiring({ type: fact.type, label: fact.label }, profile)
}

/** #4284.1 — les offres hors métier passent APRÈS les faits du métier (partition stable : l'ordre de fraîcheur tient). */
export function outOfTradeFactsLast(
  facts: readonly CardFact[],
  profile: SalesProfileForRelevance | undefined,
): CardFact[] {
  const off = (fact: CardFact) => isOutOfTradeFact(fact, profile)
  return [...facts.filter(fact => !off(fact)), ...facts.filter(off)]
}
