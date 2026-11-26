/**
 * Ce que le module FOURNIT à ses services, sous forme de jetons (#1645).
 *
 * POURQUOI DES JETONS PLUTÔT QUE DES SERVICES INJECTÉS
 * GA-07 (`module-boundaries.spec.ts`) est un CLIQUET au plafond : « aucun
 * module n'importe le SERVICE d'un autre module ». Le relever demande un
 * arbitrage écrit, et il n'y a rien à arbitrer ici — le calcul du MRR n'a pas
 * besoin du catalogue d'offres, il a besoin de DEUX dictionnaires de prix ; le
 * passage mensuel n'a pas besoin du service de verrous, il a besoin de « ne
 * tourne qu'une fois ». La composition se fait donc dans
 * `business-metrics.module.ts`, la couche prévue pour ça, et ces services-ci ne
 * connaissent que la FORME de ce qu'ils reçoivent.
 *
 * Corollaire volontaire : les prix ne sont JAMAIS recopiés ici. Une grille
 * recopiée diverge le jour où l'opérateur change un tarif, et le MRR se mettrait
 * à mesurer une grille morte.
 */

/** Le jeton d'injection. Une chaîne, pour rester lisible dans une erreur Nest. */
export const PLAN_GRIDS = 'BUSINESS_METRICS_PLAN_GRIDS'

/** `clé de plan → prix en centimes`, pour le plan lui-même et pour un siège. */
export interface PlanGrids {
  priceCents: Record<string, number>
  seatCents: Record<string, number>
}

/** Ce que le module fournit sous {@link PLAN_GRIDS}. */
export type PlanGridsReader = () => Promise<PlanGrids>

/** Le jeton du verrou. Voir le docblock de tête. */
export const SINGLETON_LOCK = 'BUSINESS_METRICS_SINGLETON_LOCK'

/**
 * « Exécute ceci une seule fois, quel que soit le nombre de replicas. »
 *
 * Sans verrou disponible, l'implémentation fournie exécute quand même — c'est le
 * comportement du dépôt, et il est sûr ici : figer un mois déjà figé n'écrit
 * rien.
 */
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
