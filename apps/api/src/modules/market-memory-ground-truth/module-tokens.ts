import type { MarketMemoryGroundTruthReading } from '@bellum/contracts'

/**
 * Ce que `MarketMemoryGroundTruthService` reçoit de la mémoire marché, sous
 * forme de JETON — même discipline que `apps/api/src/modules/
 * account-intelligence/module-tokens.ts` (#1618), pour la MÊME raison.
 *
 * **GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND** au
 * 10/09/2026 (254 imports / 124 fichiers, marge nulle). Ce service a besoin
 * d'UNE lecture cross-module — `MarketMemoryService.coverageFor` — et
 * l'importer directement ICI ferait lever GA-07 sans rien découpler. La
 * composition réelle (celle qui importe `MarketMemoryService`) vit dans
 * `market-memory-ground-truth.module.ts`, un `*.module.ts` — hors du périmètre
 * de cette garde par construction (§3.2 : « les `*.module.ts` sont la
 * composition »). Ce fichier-ci ne connaît que la FORME de ce qu'il reçoit,
 * jamais la classe qui la produit.
 *
 * ⚠️ `MarketCompanyLookup`, `MarketMemoryCoverage` et les cinq entités
 * `Market*Entity` ne sont importés NULLE PART dans ce module : GA-258 réserve
 * leur lecture directe à `market-memory/`, et ce module ne la contourne pas —
 * il reçoit une lecture déjà résolue, au format `MarketMemoryGroundTruthReading`
 * défini dans `@bellum/contracts`, indépendant des types internes du service
 * qui la produit.
 */

export const MARKET_MEMORY_GROUND_TRUTH_READER = 'MARKET_MEMORY_GROUND_TRUTH_READER'

/** Ce qu'un jugement a besoin de savoir pour désigner un cas — un miroir
 *  local et volontairement minimal de `MarketCompanyLookup`, sans jamais
 *  importer ce type (voir le docblock ci-dessus). */
export interface MarketMemoryGroundTruthLookup {
  readonly accountName: string
  readonly accountWebsite?: string | null
  readonly accountCountry?: string | null
  readonly esnName: string
}

/**
 * Le résultat d'une lecture — `unavailable` distingue une PANNE de lecture
 * (aucun jugement ne doit se fonder dessus) d'une lecture qui répond
 * normalement « cette ESN n'est pas observée pour ce compte »
 * (`reading.hadReading === false`, un `ok` tout à fait légitime).
 */
export type MarketMemoryGroundTruthReaderResult =
  | { readonly status: 'ok'; readonly reading: MarketMemoryGroundTruthReading }
  | { readonly status: 'unavailable'; readonly reason: string }

/** « Que dit la mémoire marché de ce couple ESN ↔ compte ? » — la lecture
 *  SEULE de `MarketMemoryService.coverageFor`, jamais ses tables (GA-258). */
export type MarketMemoryGroundTruthReader = (
  lookup: MarketMemoryGroundTruthLookup,
) => Promise<MarketMemoryGroundTruthReaderResult>
