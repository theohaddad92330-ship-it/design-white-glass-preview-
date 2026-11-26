import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { AccountsModule } from '../accounts/accounts.module'
import { CrmModule } from '../crm/crm.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { IaModule } from '../ia/ia.module'
import { ProjectsModule } from '../projects/projects.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MeetingNotesController } from './meeting-notes.controller'
import { MeetingNotesService } from './meeting-notes.service'

/** Module autonome (règle #7) : rien n'en dépend, le retirer ne casse rien. */
@Module({
  // `BusinessUnitModule` : le contrôleur résout le périmètre avant de donner
  // un compte en contexte au modèle. `CrmCoreModule` : #1903.12, la porte du
  // carnet du compte (`NotesService`) que `recap` écrit désormais.
  // `TypeOrmModule.forFeature([ContactEntity])` : #2777, la porte du
  // répertoire de contacts que `contacts` écrit désormais — un `Repository`
  // injecté directement (comme `CrmService.contacts`), jamais le SERVICE
  // `ContactsService` d'un autre module (GA-07). `ProjectsModule` : #2777, la
  // porte du pipe (`ProjectPipelineService`) que `need` écrit désormais —
  // celle-ci EST un import service-à-service (GA-07, relèvement jumeau dans
  // `module-boundaries.spec.ts`), voir le docblock de l'injection dans
  // `meeting-notes.service.ts` pour la raison (GA-26 côté `ProjectsModule`).
  imports: [
    IaModule,
    WorkspaceModule,
    AccountsModule,
    BusinessUnitModule,
    CrmModule,
    CrmCoreModule,
    ProjectsModule,
    TypeOrmModule.forFeature([ContactEntity]),
  ],
  controllers: [MeetingNotesController],
  providers: [MeetingNotesService],
})
export class MeetingNotesModule {}
