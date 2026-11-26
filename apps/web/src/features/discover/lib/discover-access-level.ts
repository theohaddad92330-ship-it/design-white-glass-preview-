import { accountAccessLevel, type AccountAccessLevel, type Rank1Incumbent } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'

/**
 * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS NOMMÉ, DÈS DÉCOUVRIR, SANS
 * FICHE COMPTE.
 *
 * Ses mots : « c'est là que ça sert le plus, savoir avant d'analyser si le
 * compte est atteignable en direct. » Un candidat Découvrir sans `accountId`
 * n'a ni `account_entities` ni `account_partners` : la seule preuve DÉJÀ
 * disponible, sans collecte neuve, est un signal `award` — un marché public
 * ATTRIBUÉ (DECP) — dont `detail` nomme le titulaire en place (voir le
 * commentaire de `DiscoverSignal.detail` dans `discover-types.ts`, et
 * `discover_scoring.py` côté IA : « marché attribué (DECP) — budget prouvé +
 * titulaire en place »).
 *
 * ⚠️ Cette preuve ne permet QUE d'affirmer `rang3_plus` (un titulaire est
 * nommé) ou `inconnu` (rien ne le dit) — JAMAIS `direct` : l'ABSENCE d'un
 * signal d'attribution récent ne prouve pas l'absence de rang 1 (beaucoup de
 * marchés privés n'apparaissent dans aucune source publique), et l'affirmer
 * inventerait un fait que personne n'a mesuré (GA-18/GA-19). Une fois le
 * compte analysé et une fiche créée, l'onglet Accès sert la version PRÉCISE
 * du même badge (`AccountAccessService.landscape`, même fonction pure
 * `accountAccessLevel`, GA-26 — une dérivation vit à un seul endroit).
 *
 * `hasDeclaredPartner` reste FAUX par construction : aucun compte n'existe
 * encore pour porter une déclaration de partenaire.
 */
export function discoverAccessLevel(candidate: Pick<DiscoverCandidate, 'signals'>): AccountAccessLevel {
  const rank1Incumbent: Rank1Incumbent = candidate.signals.some(
    signal => signal.type === 'award' && Boolean(signal.detail && signal.detail.trim().length > 0),
  )
    ? 'yes'
    : 'unknown'
  return accountAccessLevel({ rank1Incumbent, hasDeclaredPartner: false })
}
