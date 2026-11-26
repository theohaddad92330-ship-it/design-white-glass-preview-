import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatReplyMemoryUseEntity } from '../../database/entities/chat-reply-memory-use.entity'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { AuthModule } from '../auth/auth.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MemoryController } from './memory.controller'
import { MemoryReplyUsesService } from './memory-reply-uses.service'
import { MemoryService } from './memory.service'

/**
 * Durable copilot "long memory" (Théo P2). Exports {@link MemoryService} so the
 * IA proxy's chat-context can fold pinned facts / preferences / the rolling
 * conversation summary into the server-side chat context. Imports
 * {@link WorkspaceModule} for team scope and {@link AuthModule} for the JWT guard.
 */
@Module({
  imports: [
    AuthModule,
    WorkspaceModule,
    // #1918.2 — `BusinessUnitService` répond « de quelles équipes cette
    // personne est-elle MEMBRE » (`perimetersOf`). Sans ce module, le
    // contrôleur résout une liste VIDE : aucune mémoire d'équipe ne se lit ni
    // ne s'écrit — un repli FERMÉ, jamais l'espace entier.
    BusinessUnitModule,
    // Les COUCHES DÉCLARÉES du registre (`identity`, `workspace`) montrent le
    // profil TEL QUE LE COPILOTE LE REÇOIT. On passe donc par le résolveur
    // partagé : la fusion « profil canonique de l'espace + surcouche
    // personnelle » est une dérivation, et une dérivation vit à un seul
    // endroit — sinon l'écran de transparence montrerait autre chose que ce
    // qui part réellement dans le prompt. Ce module-ci ne traîne ni Auth, ni
    // Mailer, ni la génération de contexte : c'est sa raison d'exister.
    EsnProfileReaderModule,
    // `LauraInterventionEntity` : le registre de mémoire LIT la trace des
    // interventions (« ce qu'il a refusé, et quand », T6 §12.1) et sait
    // l'oublier. Elle est ÉCRITE par `LauraModule`, qui la déclare aussi — deux
    // `forFeature` sur la même entité n'ouvrent pas deux chemins d'écriture,
    // ils déclarent deux lecteurs (GA-20 : un dépôt injecté est déclaré).
    TypeOrmModule.forFeature([
      MemoryPinnedFactEntity,
      UserPreferenceEntity,
      ConversationSummaryEntity,
      LauraInterventionEntity,
      // `ProfileEntity` : le PRÉNOM, lu à chaque tour par le copilote. Déclaré
      // ici parce qu'il est injecté ici (GA-20). Lecture seule — il se corrige
      // dans Réglages › Mon compte, et « tout oublier » n'y touche pas.
      ProfileEntity,
      // #1916.23 — le journal des gestes sur un élément (texte, portée,
      // échéance). Écrit et relu par `MemoryService` seul (GA-20).
      MemoryFactEventEntity,
      // #1916.24 — la trace des éléments envoyés à Laura pour une réponse.
      // Écrite et relue par `MemoryReplyUsesService` seul (GA-20).
      ChatReplyMemoryUseEntity,
    ]),
  ],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryReplyUsesService],
  // `MemoryReplyUsesService` est exporté pour les CONTRÔLEURS qui orchestrent un
  // tour (`ia-proxy.controller.ts`, `mcp-api.controller.ts`) — jamais un service
  // d'un autre module (GA-07).
  exports: [MemoryService, MemoryReplyUsesService],
})
export class MemoryModule {}
