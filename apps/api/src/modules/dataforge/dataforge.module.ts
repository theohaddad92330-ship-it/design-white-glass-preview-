import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataforgeAccountEntity } from '../../database/entities/dataforge-account.entity'
import { DataforgeAccountDomainEntity } from '../../database/entities/dataforge-account-domain.entity'
import { DataforgeAccountStatusEntity } from '../../database/entities/dataforge-account-status.entity'
import { DataforgeAnomalyEntity } from '../../database/entities/dataforge-anomaly.entity'
import { DataforgeRagChunkEntity } from '../../database/entities/dataforge-rag-chunk.entity'
import { IaModule } from '../ia/ia.module'
import { DataforgeCandidatesController } from './dataforge-candidates.controller'
import { DataforgeService } from './dataforge.service'
import { InternalDataforgeController } from './internal-dataforge.controller'
import { OrionAccountsService } from './orion-accounts.service'
import { OrionAnomaliesService } from './orion-anomalies.service'
import { OrionRagChunksService } from './orion-rag-chunks.service'

/**
 * Le référentiel DATAFORGE — module autonome (règle #7 : le retirer ne casse
 * rien). Il porte deux packs qui partagent le même espace de clés `DF-XXXX` :
 * DATAFORGE V10 (`DataforgeService`, priors compte × domaine) et ORION V12
 * (`OrionAccountsService` / `OrionAnomaliesService` / `OrionRagChunksService`,
 * statuts de compte + registre qualité + chunks RAG) — voir la comparaison en
 * tête de `1791510000000-OrionV12Staging.ts`. Les consommateurs lisent
 * toujours par un service, jamais par une table.
 *
 * ⚠️ GA-20 : les cinq entités sont déclarées ici en `forFeature` — un
 * `@InjectRepository` sans déclaration empêche l'application de DÉMARRER et ne
 * se voit qu'au healthcheck Railway, jamais dans les tests.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataforgeAccountEntity,
      DataforgeAccountDomainEntity,
      DataforgeAccountStatusEntity,
      DataforgeAnomalyEntity,
      DataforgeRagChunkEntity,
    ]),
    IaModule,
  ],
  controllers: [InternalDataforgeController, DataforgeCandidatesController],
  providers: [DataforgeService, OrionAccountsService, OrionAnomaliesService, OrionRagChunksService],
  exports: [DataforgeService, OrionAccountsService, OrionAnomaliesService, OrionRagChunksService],
})
export class DataforgeModule {}
