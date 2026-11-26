import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AtsController, AtsOAuthController } from './ats.controller'
import { AtsWriteRequestEntity } from '../../database/entities/ats-write-request.entity'
import { AtsWriteService } from './ats-write.service'
import { AtsCredentialsService } from './ats-credentials.service'
import { AtsService } from './ats.service'

/**
 * La capacité « ATS/ERP ». Module autonome (règle #7) : sa table, son service,
 * et le retirer ne casse pas le reste du produit. La couche zéro lit ses identifiants ici (#4687),
 * par `AtsCredentialsService` — la seule résolution du dépôt.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([AtsConnectionEntity, AtsWriteRequestEntity])],
  controllers: [AtsController, AtsOAuthController],
  providers: [AtsService, AtsWriteService, AtsCredentialsService],
  exports: [AtsService, AtsWriteService, AtsCredentialsService],
})
export class AtsModule {}
