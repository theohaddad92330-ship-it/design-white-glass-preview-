import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContactsModule } from '../contacts/contacts.module'
import { AgendaModule } from '../agenda/agenda.module'
import { AgendaService } from '../agenda/agenda.service'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { TargetListEntity } from '../../database/entities/target-list.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { ImportTargetListWriter } from './import-target-list.writer'
import { ImportController } from './import.controller'
import { ImportWriterService } from './import-writer.service'
import { ImportService } from './import.service'
import { RESTITUTION_AGENDA_PORT, RESTITUTION_ANSWERS_PORT, RestitutionService } from './restitution.service'

/**
 * L'assistant d'import (BEL-INT-602).
 *
 * Autonome au sens de la règle #7 : le retirer supprime `/import/*` et rien
 * d'autre. Il écrit dans `accounts`, `contacts`, `opportunities`,
 * `project_needs` et `consultants` par leurs REPOSITORIES, pas par leurs
 * services — non pour
 * contourner GA-07, mais parce
 * que `AccountsService.create` lance un état `analyzing` et attend un contexte
 * de run que la reprise d'un fichier n'a pas, et que `ProjectsService` ne sait
 * créer un projet que par MATÉRIALISATION d'une analyse : il n'a aucun chemin
 * de création à la ligne, et lui en ajouter un pour l'import mettrait deux
 * façons de naître sur le même objet.
 *
 * #2159.35 — SEULE EXCEPTION, et pourquoi ce n'en est pas une : `ContactsModule`
 * rejoint les imports pour que `ImportWriterService` LISE
 * `ContactResolutionCorrectionsService.rejectedContactIds`. Ce n'est ni une
 * création ni un calcul dupliqué (GA-26) — c'est un registre de décisions
 * humaines déjà prises (« ce n'est pas la même personne »), écrit et lu à un
 * seul endroit. La distinction qui compte reste celle du paragraphe ci-dessus :
 * aucun chemin de CRÉATION n'est emprunté ici.
 */
@Module({
  imports: [
    WorkspaceModule,
    // #2159.35 — `ImportWriterService` lit `ContactResolutionCorrectionsService`
    // (jamais l'inverse) : c'est un registre de LECTURE d'une décision déjà
    // prise, pas la logique de CRÉATION d'un contact que la doctrine du module
    // (ci-dessous) réserve aux repositories — aucun cycle, aucun calcul dupliqué.
    ContactsModule,
    // #2080 — la restitution lit l'agenda de la personne connectee et les
    // reponses de son questionnaire. Les deux arrivent par des PORTS
    // duck-types cables ICI : `restitution.service.ts` n'importe aucun service
    // d'un autre module, et le cliquet GA-07 n'inspecte pas les `.module.ts`.
    AgendaModule,
    EsnProfileReaderModule,
    TypeOrmModule.forFeature([
      ImportSessionEntity,
      AccountEntity,
      ContactEntity,
      ProjectEntity,
      ProjectNeedEntity,
      ConsultantEntity,
      // #2732.1 — la reprise des missions écrit.
      MissionEntity,
      // #3753 — la liste cible d'un fichier de comptes tiérés (par repositories).
      TargetListEntity,
      TargetListItemEntity,
      // M2.1 (Meyer 20/10) — les références source des fiches importées.
      SyncLinkEntity,
    ]),
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportWriterService,
    ImportTargetListWriter,
    RestitutionService,
    { provide: RESTITUTION_AGENDA_PORT, useExisting: AgendaService },
    { provide: RESTITUTION_ANSWERS_PORT, useExisting: EsnProfileReader },
  ],
  // #2850 (#2431.11, 28/09) — `ImportWriterService` sert désormais aussi la
  // proposition depuis le dépôt `/chat` (`RagController`) : elle a besoin des
  // mêmes clés connues (`knownCompanyKeys`/`existingKeys`) que l'assistant
  // d'import lui-même, jamais un second calcul.
  exports: [ImportService, ImportWriterService],
})
export class ImportModule {}
