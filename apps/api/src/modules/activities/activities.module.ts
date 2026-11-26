import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { ActivitySyncStateEntity } from '../../database/entities/activity-sync-state.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { ActionsModule } from '../actions/actions.module'
import { AgendaModule } from '../agenda/agenda.module'
import { CrmModule } from '../crm/crm.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { TelephonyModule } from '../telephony/telephony.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ActivitiesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { ActivityCaptureService } from './activity-capture.service'

/**
 * Les ACTIVITÉS — la mémoire des échanges (T2 du chantier CRM/ATS).
 *
 * Module autonome (règle #7) : le retirer supprime la timeline et la capture,
 * sans toucher ni à la messagerie, ni à l'agenda, ni à la téléphonie, qui
 * continuent de fonctionner comme avant. La dépendance va dans ce sens et
 * jamais dans l'autre — aucun de ces trois modules ne connaît les activités.
 *
 * `ActivitiesService` est EXPORTÉ parce que les tranches suivantes écrivent
 * dans la même timeline (une tâche terminée, un CV envoyé, un changement
 * d'étape sont des activités), et deux chemins d'écriture vers la même table
 * finiraient par en produire deux définitions.
 *
 * `ActionsModule` rejoint la liste pour #2377.6 : la prochaine action déclarée
 * en fin d'appel s'écrit dans `action_plan_items` (via
 * `ActionPlanItemsService.createManual`, déjà exporté par ce module) plutôt
 * que de dupliquer la notion d'owner/date/condition ici.
 *
 * `CrmModule` rejoint la liste pour #2984, resserré (pas remplacé) le
 * 25/09/2026 par #2386.A/#3010 : le diff CRM proposé après un appel ET la
 * note écrite depuis la saisie manuelle réutilisent tous deux
 * `CrmService.logActivity`/`findContactRecord` (les portes existantes),
 * jamais une seconde écriture. Import SANS `forwardRef` — `CrmModule` est une
 * FEUILLE, aucun de ses imports ne remonte à `ActivitiesModule` (vérifié par
 * grep exhaustif le 25/09/2026), contrairement à `MailboxModule` juste en
 * dessous.
 *
 * `ActivitiesService` dépend DIRECTEMENT de `CrmService` (guard #2377.8,
 * RESSERRÉE ce même jour plutôt qu'effacée : elle borne maintenant les appels
 * autorisés à `findContactRecord`/`logActivity`, jamais une création
 * d'affaire, plutôt que d'interdire l'import lui-même). `CrmModule` exporte
 * déjà `CrmService` : aucune entrée `providers` supplémentaire n'est
 * nécessaire ici pour ce branchement.
 */
@Module({
  imports: [
    PlanFeaturesModule,
    WorkspaceModule,
    forwardRef(() => MailboxModule),
    AgendaModule,
    TelephonyModule,
    ActionsModule,
    CrmModule,
    TypeOrmModule.forFeature([
      ActivityEntity,
      ActivityParticipantEntity,
      ActivitySyncStateEntity,
      ContactEntity,
      ProjectEntity,
      SyncLinkEntity,
    ]),
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityCaptureService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
