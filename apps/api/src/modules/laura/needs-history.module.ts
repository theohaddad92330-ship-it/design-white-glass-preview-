import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { NeedsHistoryController } from './needs-history.controller'
import { NeedsHistoryService } from './needs-history.service'

/** #4759 — l'historique des besoins de Laura. Autonome (règle #7) : TypeORM seul, aucun module voisin. */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  controllers: [NeedsHistoryController],
  providers: [NeedsHistoryService],
  exports: [NeedsHistoryService],
})
export class NeedsHistoryModule {}
