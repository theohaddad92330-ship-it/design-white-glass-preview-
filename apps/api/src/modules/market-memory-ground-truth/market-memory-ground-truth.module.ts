import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { MarketMemoryGroundTruthReading } from '@bellum/contracts'
import { MarketMemoryGroundTruthJudgmentEntity } from '../../database/entities/market-memory-ground-truth-judgment.entity'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { MarketMemoryGroundTruthController } from './market-memory-ground-truth.controller'
import { MarketMemoryGroundTruthService } from './market-memory-ground-truth.service'
import { MARKET_MEMORY_GROUND_TRUTH_READER, type MarketMemoryGroundTruthReader } from './module-tokens'

/**
 * #1622 — L'OUTILLAGE DE VÉRITÉ TERRAIN, module AUTONOME (règle #7 : le
 * retirer fait disparaître le jeu de vérité terrain, rien d'autre — aucun
 * autre module n'en dépend).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE LECTEUR SE COMPOSE ICI, ET PAS DANS LE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryGroundTruthService` n'importe PAS `MarketMemoryService` : GA-07
 * (`module-boundaries.spec.ts`) est un cliquet au PLAFOND (254/254 imports,
 * 124/124 fichiers) au 10/09/2026, et ce fichier-ci — un `*.module.ts` — est
 * HORS de son périmètre par construction (§3.2 de la garde : « les
 * `*.module.ts` sont la composition »). C'est donc ICI, et seulement ici, que
 * `MarketMemoryService` est importé et connecté à son jeton
 * ({@link MARKET_MEMORY_GROUND_TRUTH_READER}, `module-tokens.ts`).
 *
 * Le lecteur traduit `MarketMemoryCoverage.esnObserved` (mémoire marché) vers
 * `MarketMemoryGroundTruthReading` (vérité terrain) — deux types distincts
 * dans deux packages, pour que ce module ne dépende jamais de la FORME interne
 * de la mémoire marché, seulement du contrat qu'il a lui-même défini.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MarketMemoryGroundTruthJudgmentEntity]), MarketMemoryModule],
  controllers: [MarketMemoryGroundTruthController],
  providers: [
    MarketMemoryGroundTruthService,
    {
      provide: MARKET_MEMORY_GROUND_TRUTH_READER,
      inject: [MarketMemoryService],
      useFactory:
        (marketMemory: MarketMemoryService): MarketMemoryGroundTruthReader =>
        async lookup => {
          const read = await marketMemory.coverageFor({
            ref: lookup.accountName,
            name: lookup.accountName,
            website: lookup.accountWebsite ?? null,
            country: lookup.accountCountry ?? null,
          })
          if (read.status === 'unavailable') return { status: 'unavailable', reason: read.reason }

          const needle = lookup.esnName.trim().toLowerCase()
          const observed = read.coverage.covered ? read.coverage.esnObserved : []
          const index = observed.findIndex(entry => entry.esnName.trim().toLowerCase() === needle)

          const reading: MarketMemoryGroundTruthReading =
            index === -1
              ? { hadReading: false, rank: null, persons: null, certainty: null }
              : {
                  hadReading: true,
                  rank: index + 1,
                  persons: observed[index]!.persons,
                  certainty: observed[index]!.certainty,
                }
          return { status: 'ok', reading }
        },
    },
  ],
  exports: [MarketMemoryGroundTruthService],
})
export class MarketMemoryGroundTruthModule {}
