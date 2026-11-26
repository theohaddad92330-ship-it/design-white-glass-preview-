/**
 * #3253.c — le jeton du verrou pour le passage hebdomadaire, jamais le
 * service importé directement. GA-07 (`module-boundaries.spec.ts`) est un
 * CLIQUET au plafond : « aucun module n'importe le SERVICE d'un autre
 * module ». Le relever demande un arbitrage écrit, et il n'y a rien à
 * arbitrer ici — le passage hebdomadaire n'a pas besoin du service de
 * verrous, il a besoin de « ne tourne qu'une fois ». La composition se fait
 * donc dans `weakest-link-diagnosis.module.ts` (même patron que
 * `business-metrics/module-tokens.ts`).
 */

export const SINGLETON_LOCK = 'WEAKEST_LINK_DIAGNOSIS_SINGLETON_LOCK'

/** « Exécute ceci une seule fois, quel que soit le nombre de replicas. »
 *  Sans verrou disponible, l'implémentation fournie exécute quand même. */
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
