import type { DiscoverCardNature } from '@bellum/contracts'
import type { DiscoverSignal } from './discover-types'

/**
 * #4068 (lot DECOUVRIR-CARTE, Louis 13/10) — la NATURE lisible d'un fait de
 * carte, jamais le vocabulaire de nos sources. Remplace les trois mots du
 * #4068.2 (Recrutement / Besoin / Signal) : « Signal » ne disait rien. La
 * nature elle-même est décidée au contrat (`classifyCardFact`, GA-26).
 */
export function factNatureLabelKey(nature: DiscoverCardNature): string {
  return `facts.nature.${nature}`
}

/**
 * #4068.4 — le lien d'un fait est générique : « Voir l'annonce » quand le
 * fait EST une annonce (offre, appel d'offres), « Voir la source » sinon.
 * Jamais le nom d'un registre ou d'un portail.
 */
export function factLinkKey(type: DiscoverSignal['type']): string {
  return type === 'hiring' || type === 'tender' ? 'facts.linkAnnouncement' : 'facts.linkSource'
}

/**
 * #4285.1 — le fait BODACC « Augmentation de capital » (type `business`, libellé EXACT du serveur, jumeau du
 * classement du contrat). Son libellé est affiché traduit (`facts.capitalIncrease`) ; une actualité qui en
 * parle (« Augmentation de capital de X ») garde son titre.
 */
export function isCapitalIncreaseFact(fact: Pick<DiscoverSignal, 'type' | 'label'>): boolean {
  return fact.type === 'business' && fact.label.trim().toLowerCase() === 'augmentation de capital'
}
