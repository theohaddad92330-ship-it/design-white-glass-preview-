import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BeeperConnectionEntity } from '../../database/entities/beeper-connection.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CrmModule } from '../crm/crm.module'
import { OutboundWriteService } from '../crm/outbound-write.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BEEPER_SEND_GATE, BEEPER_WORKSPACE } from './beeper-ports'
import { BeeperController } from './beeper.controller'
import { BeeperService } from './beeper.service'

/**
 * #4406 — Beeper Desktop (lire et répondre aux conversations, sous mandat).
 *
 * Indépendant : le retirer ne casse que Messagerie › Beeper et l'outil de Laura qui le lit. Il
 * importe `CrmModule` pour la PORTE d'écriture (`OutboundWriteService`) — l'envoi n'a pas d'autre
 * chemin. Inerte tant que l'utilisateur n'a rien branché (aucun appel réseau).
 */
@Module({
  imports: [CrmModule, WorkspaceModule, TypeOrmModule.forFeature([BeeperConnectionEntity, ContactEntity])],
  controllers: [BeeperController],
  providers: [
    BeeperService,
    // GA-07 — les ports du service, branchés ICI (composition) sur les vrais voisins.
    { provide: BEEPER_SEND_GATE, useExisting: OutboundWriteService },
    { provide: BEEPER_WORKSPACE, useExisting: WorkspaceContextService },
  ],
  exports: [BeeperService],
})
export class BeeperModule {}
