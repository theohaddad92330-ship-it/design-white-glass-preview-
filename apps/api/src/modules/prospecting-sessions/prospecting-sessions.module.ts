import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProspectingSessionEntity } from '../../database/entities/prospecting-session.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ProspectingSessionsController } from './prospecting-sessions.controller'
import { ProspectingSessionsService } from './prospecting-sessions.service'

/**
 * #2386.9 — module autonome (règle #7) : le retirer supprime la télémétrie
 * PAR PARCOURS de la session de prospection, rien d'autre — aucun autre
 * module n'importe `ProspectingSessionsService`.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([ProspectingSessionEntity])],
  controllers: [ProspectingSessionsController],
  providers: [ProspectingSessionsService],
})
export class ProspectingSessionsModule {}
