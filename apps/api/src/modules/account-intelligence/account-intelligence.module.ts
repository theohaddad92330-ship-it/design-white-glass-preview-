import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { AccountIntelligenceDataforgeStatus } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { FieldConflictService } from '../crm-core/field-conflict.service'
import { DataforgeModule } from '../dataforge/dataforge.module'
import { OrionAccountsService } from '../dataforge/orion-accounts.service'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { AccountIntelligenceContextService } from './account-intelligence-context.service'
import {
  DATAFORGE_ACCOUNT_STATUS_READER,
  FIELD_CONFLICTS_READER,
  MARKET_MEMORY_COVERAGE_READER,
  type DataforgeAccountStatusReader,
  type FieldConflictsReader,
  type MarketMemoryCoverageReader,
} from './module-tokens'

/**
 * #1618 — LA façade `AccountIntelligenceContext`, module NEUF et autonome
 * (règle #7 : le retirer fait disparaître la façade, rien d'autre — aucun
 * appelant n'existe encore dans ce lot, voir le rapport).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES JETONS PLUTÔT QUE DES IMPORTS DE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountIntelligenceContextService` (`account-intelligence-context.service.ts`)
 * n'importe NI `OrionAccountsService` NI `MarketMemoryService` NI
 * `FieldConflictService` : GA-07 (`module-boundaries.spec.ts`) est un cliquet
 * au PLAFOND (marge nulle au 10/09/2026), et ce fichier-ci — un `*.module.ts`
 * — est HORS de son périmètre par construction (§3.2 de la garde : « les
 * `*.module.ts` sont la composition »). C'est donc ICI, et seulement ici, que
 * les trois services sont importés et connectés à leurs jetons (#3219 pour le
 * troisième, `FIELD_CONFLICTS_READER`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, FieldProvenanceEntity, RecordFieldAuditEntity]),
    DataforgeModule,
    MarketMemoryModule,
  ],
  providers: [
    AccountIntelligenceContextService,
    // `FieldConflictService` (module `crm-core`) : PAS un import cross-module
    // (`CrmCoreModule` traîne `PlanFeaturesModule`/`WorkspaceModule`/`LocksModule`
    // /`TriggerRegistryModule`, hors de propos ici). Le service est pur —
    // `RecordFieldAuditEntity` en lecture seule, aucune écriture, aucune table
    // neuve (voir son propre docblock) — donc le redéclarer ici, avec la MÊME
    // entité TypeORM juste au-dessus, ne pose pas une seconde vérité : c'est
    // la même classe, le même repository Postgres, une seconde instance sans
    // état qui en divergerait.
    FieldConflictService,
    {
      provide: DATAFORGE_ACCOUNT_STATUS_READER,
      inject: [OrionAccountsService],
      useFactory:
        (orion: OrionAccountsService): DataforgeAccountStatusReader =>
        async (siren: string): Promise<AccountIntelligenceDataforgeStatus | null> => {
          const status = await orion.statusForSiren(siren)
          if (!status) return null
          return {
            companyName: status.entreprise,
            sector: status.sector,
            headquarters: status.headquarters,
            penetrabilite: status.penetrabilite,
            priorityLevel: status.priorityLevel,
            accountPotentialScore: status.accountPotentialScore,
            dataConfidenceScore: status.dataConfidenceScore,
            recommendedEntryPoint: status.recommendedEntryPoint,
            recommendedPersona: status.recommendedPersona,
            recommendedStrategy: status.recommendedStrategy,
            nextAction: status.nextAction,
            mainRisk: status.mainRisk,
            observedAt: status.observedAt,
            access: status.access,
            dataVersion: status.dataVersion,
          }
        },
    },
    {
      provide: MARKET_MEMORY_COVERAGE_READER,
      inject: [MarketMemoryService],
      useFactory:
        (marketMemory: MarketMemoryService): MarketMemoryCoverageReader =>
        lookup =>
          marketMemory.coverageFor(lookup),
    },
    {
      provide: FIELD_CONFLICTS_READER,
      inject: [FieldConflictService],
      useFactory:
        (fieldConflicts: FieldConflictService): FieldConflictsReader =>
        (accountId, workspaceId) =>
          fieldConflicts.openConflicts(workspaceId, 'account', accountId),
    },
  ],
  exports: [AccountIntelligenceContextService],
})
export class AccountIntelligenceModule {}
