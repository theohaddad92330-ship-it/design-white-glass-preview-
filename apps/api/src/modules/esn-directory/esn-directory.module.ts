import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from '../../database/entities/territory-subscription.entity'
import { IaModule } from '../ia/ia.module'
import { LocksModule } from '../locks/locks.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { EsnDirectoryService } from './esn-directory.service'
import { MarketWatchController } from './market-watch.controller'
import { TerritoryController } from './territory.controller'
import { TerritoryWatchService } from './territory-watch.service'

/**
 * Le référentiel ESN — module autonome (règle #7 : le retirer ne casse rien).
 *
 * Il ne dépend que du client IA (pour la résolution registre) et de sa propre
 * table. Rien d'autre du dépôt ne lui parle : les consommateurs — Territoire,
 * Partenaires — le lisent par son service, jamais par sa table.
 *
 * Les DEUX tâches planifiées de ce module n'ont pas la même réponse au
 * multi-réplique, et c'est délibéré : le rafraîchissement du référentiel réserve
 * son lot en base (`FOR UPDATE SKIP LOCKED`) et GAGNE à tourner partout, la
 * veille territoriale prend un verrou parce que sa passe COÛTE. `LocksModule`
 * n'est là que pour la seconde.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EsnDirectoryEntity, TerritorySnapshotEntity, TerritorySubscriptionEntity]),
    IaModule,
    LocksModule,
    WorkspaceModule,
  ],
  controllers: [TerritoryController, MarketWatchController],
  providers: [EsnDirectoryService, TerritoryWatchService],
  exports: [EsnDirectoryService],
})
export class EsnDirectoryModule {}
