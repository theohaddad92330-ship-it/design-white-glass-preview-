import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConnectorScopeGapEntity } from '../../database/entities/connector-scope-gap.entity'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { AdminScopeGapsController } from './admin-scope-gaps.controller'
import { ConnectorScopeGapsService } from './connector-scope-gaps.service'
import { SCOPE_GAP_RECORDER } from './scope-gap-recorder.port'

/**
 * SCOPES-I — une portée OAuth manquante ne passe plus inaperçue. Retirer ce module ne casse aucun
 * connecteur : chacun appelle le service en `@Optional()`, sans lui la connexion se fait comme avant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ConnectorScopeGapEntity]), NotificationsCoreModule],
  controllers: [AdminScopeGapsController],
  providers: [ConnectorScopeGapsService, { provide: SCOPE_GAP_RECORDER, useExisting: ConnectorScopeGapsService }],
  exports: [ConnectorScopeGapsService, SCOPE_GAP_RECORDER],
})
export class ConnectorScopeGapsModule {}
