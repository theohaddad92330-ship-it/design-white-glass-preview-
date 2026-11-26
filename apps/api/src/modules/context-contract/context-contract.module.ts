import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { ProfileContextModule } from '../profile-context/profile-context.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContextContractController } from './context-contract.controller'

/**
 * #2454 — le contrat de contexte des surfaces hors conversation. Module
 * autonome (règle #7) : le retirer supprime `GET /context-contract` et la ligne
 * « Contexte utilisé » de Découvrir/Analyser retombe sur rien, sans rien
 * casser ailleurs. Il LIT le profil (lecteur sans dépendance), le profileur
 * (#2889 — le PÉRIMÈTRE de `idealAccountProfile`, via la lecture GARDÉE de
 * `ProfileContextService.getMe`) et la connexion CRM ; il n'écrit rien.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CrmConnectionEntity]),
    EsnProfileReaderModule,
    ProfileContextModule,
    WorkspaceModule,
  ],
  controllers: [ContextContractController],
})
export class ContextContractModule {}
