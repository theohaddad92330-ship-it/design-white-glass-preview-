import { createContext, useContext, type ReactNode } from 'react'

/**
 * #1847 — UNE SURCOUCHE OUVERTE PREND LA PORTÉE, ET LA REND EN SE FERMANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 10/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `/watchlist` pose une amorce de niveau LISTE (« Quels signaux méritent une
 * action aujourd'hui ? »). Le clic sur un signal ouvre une modale qui pose la
 * SIENNE (`detail.askLaura`, qui interpole le nom de l'entreprise et le libellé
 * du signal). Deux amorces vivantes, une seule bulle.
 *
 * La règle d'avant — « le dernier monté gagne » — donne le BON résultat à
 * l'ouverture, par accident : la modale monte après la page. Elle donne deux
 * mauvais résultats partout ailleurs, et les deux ont été mesurés :
 *
 *  1. **À la FERMETURE, l'amorce était perdue pour de bon.** Le magasin n'avait
 *     qu'un seul emplacement : la modale l'écrasait en s'ouvrant, puis le
 *     remettait à `null` en se fermant. Le dépôt de la page, lui, ne se rejoue
 *     qu'au changement de son contenu — donc jamais. Après avoir ouvert PUIS
 *     refermé un seul signal, `/watchlist` n'avait plus AUCUNE amorce dans la
 *     bulle, jusqu'à un rechargement.
 *  2. **Un dépôt de PAGE qui se rejoue reprenait la main sur une surcouche
 *     ouverte.** Une ligne de liste qui change de contenu (`MissionTrackingTable`
 *     en pose un PAR LIGNE) republie et repasse en tête — la modale ouverte
 *     perdait la portée sans que rien ne bouge à l'écran.
 *
 * La réponse n'est pas un tri plus malin sur l'ordre de montage : c'est une
 * notion de PORTÉE. Tant qu'une surcouche est ouverte, c'est ELLE qui tient
 * l'amorce ; quand elle se ferme, la page la reprend, sans rechargement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTEXTE REACT ICI, ALORS QUE LE RESTE EST UN MAGASIN EXTERNE
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura-intro-store` est un magasin externe justement pour ne PAS re-rendre
 * l'application à chaque frappe. Mais la profondeur de portée n'est pas une
 * valeur qui change : elle est fixée par la POSITION du composant dans l'arbre,
 * et elle ne bouge jamais pendant la vie d'une surcouche. Un contexte qui ne
 * change pas ne re-rend rien — c'est exactement le cas d'usage, et c'est la
 * seule façon de savoir « suis-je DANS une surcouche ? » sans lire le DOM
 * (`AskLaura` ne rend parfois aucun nœud : il n'y aurait rien à interroger).
 *
 * ⚠️ La valeur du contexte est un NOMBRE, pas un booléen : une surcouche peut
 * en contenir une autre (un tiroir ouvert au-dessus d'une modale), et c'est la
 * plus PROFONDE qui doit gagner. Un booléen aurait fait de deux surcouches
 * imbriquées une égalité, tranchée à nouveau par l'ordre de montage.
 */
const LauraIntroScopeContext = createContext(0)

/**
 * À poser par la surcouche elle-même, autour de son CONTENU — jamais par
 * l'écran qui l'ouvre. C'est ce qui fait qu'un futur appelant de
 * `BrowsableDialog` hérite du bon comportement sans rien savoir de Laura.
 */
export function LauraIntroScope({ children }: { children: ReactNode }) {
  const parent = useContext(LauraIntroScopeContext)
  // Une profondeur est un nombre primitif : aucune identité d'objet à
  // mémoriser, donc aucun re-rendu parasite chez les consommateurs.
  return <LauraIntroScopeContext.Provider value={parent + 1}>{children}</LauraIntroScopeContext.Provider>
}

/**
 * La profondeur de portée du composant appelant. `0` = la page elle-même,
 * `1` et au-delà = à l'intérieur d'une surcouche.
 */
export function useLauraIntroScope(): number {
  return useContext(LauraIntroScopeContext)
}
