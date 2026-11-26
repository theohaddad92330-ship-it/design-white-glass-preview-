import type { AccountIntelligenceDataforgeStatus, ConflictedField, MarketMemoryRead } from '@bellum/contracts'

/**
 * Ce que la façade `AccountIntelligenceContextService` reçoit de DataForge et
 * de la mémoire marché, sous forme de JETON — même discipline que
 * `apps/api/src/modules/partners/module-tokens.ts` (#1645), pour la MÊME
 * raison.
 *
 * **GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND** au
 * 10/09/2026 (254 imports / 124 fichiers, marge nulle). La façade a besoin de
 * DEUX lectures cross-module — `OrionAccountsService.statusForSiren` et
 * `MarketMemoryService.coverageFor` — et les importer directement ICI ferait
 * lever GA-07 sans rien découpler. La composition réelle (celle qui importe
 * les deux classes de service) vit dans `account-intelligence.module.ts`, un
 * `*.module.ts` — hors du périmètre de cette garde par construction (§3.2 :
 * « les `*.module.ts` sont la composition »). Ce fichier-ci ne connaît que la
 * FORME de ce qu'il reçoit, jamais les classes qui la produisent.
 *
 * ⚠️ `MarketCompanyLookup` (`market-memory.service.ts`) n'est PAS importé non
 * plus, pour la même raison : {@link AccountIntelligenceMarketMemoryLookup}
 * en est un miroir délibéré, pas un raccourci.
 */

/** Ce qu'il faut savoir d'un compte pour interroger la mémoire marché — un
 *  miroir de `MarketCompanyLookup`, volontairement local (voir le docblock). */
interface AccountIntelligenceMarketMemoryLookup {
  readonly ref: string
  readonly name: string
  readonly website?: string | null
  readonly country?: string | null
}

export const DATAFORGE_ACCOUNT_STATUS_READER = 'DATAFORGE_ACCOUNT_STATUS_READER'

/**
 * « Que dit DataForge de ce compte, par SIREN ? » — synchrone dans son
 * CONTRAT (toujours une promesse, jamais un jet) : un SIREN absent ou
 * ambigu rend `null`, jamais une erreur — DataForge est une source
 * DÉGRADABLE de la façade, pas une dépendance dure.
 */
export type DataforgeAccountStatusReader = (siren: string) => Promise<AccountIntelligenceDataforgeStatus | null>

export const MARKET_MEMORY_COVERAGE_READER = 'MARKET_MEMORY_COVERAGE_READER'

/** « Que dit la mémoire marché de ce compte ? » — la lecture SEULE de
 *  `MarketMemoryService.coverageFor`, sans jamais recopier ses tables (GA-258). */
export type MarketMemoryCoverageReader = (lookup: AccountIntelligenceMarketMemoryLookup) => Promise<MarketMemoryRead>

export const FIELD_CONFLICTS_READER = 'FIELD_CONFLICTS_READER'

/**
 * #190.1/#190.8 (épopée #3219) — « quelles contradictions de champ restent
 * OUVERTES sur ce compte ? » — la lecture SEULE de
 * `FieldConflictService.openConflicts('account', …)`, même discipline de
 * jeton que les deux lecteurs ci-dessus (GA-07 au plafond). Rejouée à chaque
 * appel depuis `record_field_audit` (append-only) : une contradiction non
 * tranchée reste donc visible d'une conversation à l'autre sans qu'aucune
 * table neuve ne soit posée à côté du journal.
 */
export type FieldConflictsReader = (accountId: string, workspaceId: string) => Promise<readonly ConflictedField[]>
