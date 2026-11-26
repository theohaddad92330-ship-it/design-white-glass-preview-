import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { AccountFactsExportController } from './account-facts-export.controller'
import { AccountFactsExportService } from './account-facts-export.service'
import { AccountFactsController } from './account-facts.controller'
import { AccountFactsService } from './account-facts.service'
import {
  ACCOUNT_FACTS_MARKET_MANY_READER,
  ACCOUNT_FACTS_MARKET_READER,
  ACCOUNT_FACTS_READER,
  type AccountFactsMarketManyReader,
  type AccountFactsMarketReader,
} from './module-tokens'

/**
 * #4069.1 — le module du lecteur unique des faits du compte. AUTONOME (craft
 * rule 7) : il ne lit qu'en SQL, et la mémoire marché lui arrive par jeton —
 * le retirer ne casse que ses consommateurs, qui l'injectent `@Optional()`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity]), MarketMemoryModule, WorkspaceModule],
  controllers: [AccountFactsController, AccountFactsExportController],
  providers: [
    AccountFactsService,
    AccountFactsExportService,
    { provide: ACCOUNT_FACTS_READER, useExisting: AccountFactsService },
    {
      provide: ACCOUNT_FACTS_MARKET_READER,
      inject: [MarketMemoryService],
      useFactory:
        (marketMemory: MarketMemoryService): AccountFactsMarketReader =>
        lookup =>
          marketMemory.coverageFor(lookup),
    },
    {
      provide: ACCOUNT_FACTS_MARKET_MANY_READER,
      inject: [MarketMemoryService],
      useFactory:
        (marketMemory: MarketMemoryService): AccountFactsMarketManyReader =>
        lookups =>
          marketMemory.coverageForMany(lookups),
    },
  ],
  exports: [AccountFactsService, ACCOUNT_FACTS_READER],
})
export class AccountFactsModule {}
