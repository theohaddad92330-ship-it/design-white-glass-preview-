/**
 * Port du catalogue d'offres, vu par l'analytique d'adoption (#1685).
 *
 * Pourquoi un port plutôt qu'un import direct de `PlanCatalogService` : la garde
 * **GA-07** (`module-boundaries.spec.ts`) est un CLIQUET, et il est AU PLAFOND
 * (254 imports service→service, 124 fichiers). Elle compte les
 * `from '../<module>/<fichier contenant "service">'` dans les fichiers de
 * `modules/`, en excluant `.module.ts`, `.controller.ts` et `.spec.ts` — parce
 * que le câblage appartient au module, pas au fichier de logique.
 *
 * Trois lots l'ont fait tomber dans la même nuit (10-11/09/2026) en important
 * un service d'un module voisin ; les trois sont réparés par cette même
 * inversion. Le message du test le dit lui-même : « passe par un contrat
 * partagé, un événement, ou fais l'orchestration dans le contrôleur ».
 *
 * ⚠️ La forme lue est RECOPIÉE, jamais importée de `../credits/…` : importer
 * `PlanDefinition` recréerait le couplage par les types, et la garde ne le
 * verrait pas — elle ne compte que les fichiers dont le nom contient
 * « service ». Un couplage qu'une garde ne voit pas est pire qu'un couplage
 * qu'elle compte.
 *
 * Deux champs suffisent ici, et c'est tout ce que le port promet : la clé de
 * l'offre et les fonctions qu'elle ouvre.
 */

import type { PlanFeatureKey } from '@bellum/contracts'

/** Ce que l'analytique d'adoption lit d'une offre — deux champs, pas le catalogue entier.
 *
 *  `PlanFeatureKey` vient du CONTRAT partagé (`@bellum/contracts`), pas du module
 *  voisin : c'est le vocabulaire commun, il n'introduit aucun couplage de module. */
interface PlanCatalogEntry {
  readonly key: string
  readonly features: readonly PlanFeatureKey[]
}

/** La seule question que l'analytique pose au catalogue : donne-moi les offres. */
export interface PlanCatalogPort {
  all(): Promise<readonly PlanCatalogEntry[]>
}

/**
 * Jeton d'injection. Un `Symbol` plutôt qu'une chaîne : deux jetons de même nom
 * dans deux modules ne peuvent pas se confondre silencieusement.
 *
 * ⚠️ Il se fournit par `useFactory` typée, JAMAIS par `useExisting` : avec un
 * jeton `Symbol`, `useExisting` n'impose aucune vérification de forme, et une
 * dérive de signature côté `PlanCatalogService` ne ferait pas tomber la
 * compilation. Voir `analytics.module.ts`.
 */
export const PLAN_CATALOG_PORT = Symbol('PLAN_CATALOG_PORT')
