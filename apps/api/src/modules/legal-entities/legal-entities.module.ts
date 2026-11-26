import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LegalEntityEntity } from '../../database/entities/legal-entity.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LegalEntitiesController } from './legal-entities.controller'
import { LegalEntitiesService } from './legal-entities.service'

/**
 * Les sociétés d'une ESN dans un même espace (décision D9). Module autonome
 * (règle #7) : le retirer fait disparaître le registre et le rattachement, sans
 * toucher aux missions — leur colonne redevient simplement inutilisée.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LegalEntityEntity]), WorkspaceModule],
  controllers: [LegalEntitiesController],
  providers: [LegalEntitiesService],
  exports: [LegalEntitiesService],
})
export class LegalEntitiesModule {}
