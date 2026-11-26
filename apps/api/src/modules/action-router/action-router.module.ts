import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ContactEnrichmentService } from '../contacts/contact-enrichment.service'
import { ContactsModule } from '../contacts/contacts.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { DealStageSlaService } from '../crm-core/deal-stage-sla.service'
import { CrmModule } from '../crm/crm.module'
import { CrmWriteService } from '../crm/crm-write.service'
import { GoogleModule } from '../google/google.module'
import { GoogleService } from '../google/google.service'
import { IaClient } from '../ia/ia.client'
import { MailboxModule } from '../mailbox/mailbox.module'
import { MailboxService } from '../mailbox/mailbox.service'
import { MemoryModule } from '../memory/memory.module'
import { MemoryService } from '../memory/memory.service'
import { MicrosoftModule } from '../microsoft/microsoft.module'
import { MicrosoftService } from '../microsoft/microsoft.service'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { NotificationsService } from '../notifications/notifications.service'
import { ProjectsModule } from '../projects/projects.module'
import { ProjectsService } from '../projects/projects.service'
import { RoutinesModule } from '../routines/routines.module'
import { RoutinesService } from '../routines/routines.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ActionRouterController } from './action-router.controller'
import {
  ActionRouterService,
  CALENDAR_BACKENDS,
  NOTIFIER_BACKEND,
  type CalendarBackend,
  type NotifierBackend,
} from './action-router.service'
import {
  ACTION_ROUTER_PORTS,
  crmWritesPortFrom,
  enrichmentJobsPortFrom,
  mailDraftPortFrom,
  memoryPortFrom,
  messageDraftPortFrom,
  projectsPortFrom,
  routinePortFrom,
  settingsPortFrom,
  type ActionRouterPorts,
} from './card-effect-ports'

/**
 * Adapte le service Google Workspace à la forme minimale dont le routeur a besoin.
 *
 * L'adaptateur vit ICI plutôt que dans le module Google, parce que c'est le
 * routeur qui a un besoin, pas Google qui a une obligation : le module Google
 * reste autonome (règle CLAUDE n°7) et ignore l'existence du routeur.
 *
 * `isConnected` s'appuie sur les CAPACITÉS réellement accordées, pas sur la
 * simple existence d'une connexion : un espace connecté avec un scope réduit
 * (Drive seul, par exemple) n'a pas d'agenda, et proposer d'y poser un rappel
 * produirait un échec au moment le plus coûteux — après le clic.
 */
function googleCalendar(google: GoogleService): CalendarBackend {
  return {
    key: 'google',
    async isConnected(userId) {
      const status = await google.getStatus(userId)
      return Boolean(status.connected && status.capabilities?.calendar)
    },
    async createEvent(userId, input) {
      const created = await google.createCalendarEvent(userId, {
        summary: input.title,
        startDateTime: input.startsAt,
        endDateTime: input.endsAt,
        ...(input.note ? { description: input.note } : {}),
        ...(input.attendees.length ? { attendees: input.attendees } : {}),
        ...(input.link ? { link: input.link } : {}),
      })
      return { id: created.id }
    },
  }
}

/** Même adaptation pour Microsoft 365 / Outlook. */
function microsoftCalendar(microsoft: MicrosoftService): CalendarBackend {
  return {
    key: 'microsoft',
    async isConnected(userId) {
      const status = await microsoft.getStatus(userId)
      return Boolean(status.connected)
    },
    async createEvent(userId, input) {
      const created = await microsoft.createCalendarEvent(userId, {
        subject: input.title,
        start: input.startsAt,
        end: input.endsAt,
        ...(input.note ? { body: input.note } : {}),
        ...(input.attendees.length ? { attendees: input.attendees.map(email => ({ email })) } : {}),
      })
      return { id: created.id }
    },
  }
}

/**
 * Action Router — orchestrates recommendation → execution over the capabilities
 * already on `main` (send-email #394, CRM export, Apollo enrich, the connected
 * calendar) plus an internal reminder/snooze journal. It owns no business logic
 * of its own: it dispatches to the feature modules it imports and writes to the
 * shared `user_actions` journal. Self-contained (Craft rule #7): removing it
 * breaks nothing else.
 *
 * #1931 L2 — the ports of `card-effect-ports.ts` are wired HERE, the one file
 * that may name another module's service without counting against GA-07
 * (composition, not logic). No import cycle: none of the modules added below
 * reaches `ActionRouterModule`, `ActionOsModule` or `OutreachModule` (graph
 * walked over the 120 `*.module.ts` on 13/09/2026).
 */
@Module({
  imports: [
    ContactsModule,
    // #4185 — `CrmModule` exporte le registre des adaptateurs CRM (les cinq fournisseurs).
    CrmModule,
    WorkspaceModule,
    GoogleModule,
    MicrosoftModule,
    // Le module CORE, pas le module complet : il n'expose que le service et ses
    // trois dépôts, sans mailer, sans planificateur, sans contrôleur. C'est
    // exactement ce dont un site de déclenchement a besoin — et c'est ce qui
    // évite de tirer le graphe de la file d'attente dans le routeur d'actions.
    NotificationsCoreModule,
    // #1931 L2 — les capacités des cinq intents de carte.
    MailboxModule,
    RoutinesModule,
    MemoryModule,
    CrmCoreModule,
    // #3076 (épopée #2858) — `update_opportunity` (la carte d'opportunité de Laura).
    ProjectsModule,
    // UserActionEntity: the shared action journal (write dispatch + reminder rows,
    // update snooze state). AccountEntity: resolve a contact's company for enrich.
    // OutreachSequenceEntity/OutreachSequenceStepEntity: `stop_sequence` (#2771) —
    // entities only, never `OutreachModule` itself (it already imports this module).
    TypeOrmModule.forFeature([UserActionEntity, AccountEntity, OutreachSequenceEntity, OutreachSequenceStepEntity]),
  ],
  controllers: [ActionRouterController],
  providers: [
    ActionRouterService,
    {
      // L'ORDRE est la préférence : le premier agenda connecté gagne. Google
      // d'abord parce que c'est la connexion la plus répandue chez les ESN ;
      // aucun des deux n'est requis, une liste vide est un état valide et le
      // rappel retombe alors sur le journal interne.
      provide: CALENDAR_BACKENDS,
      inject: [GoogleService, MicrosoftService],
      useFactory: (google: GoogleService, microsoft: MicrosoftService): CalendarBackend[] => [
        googleCalendar(google),
        microsoftCalendar(microsoft),
      ],
    },
    {
      provide: NOTIFIER_BACKEND,
      inject: [NotificationsService],
      useFactory: (notifications: NotificationsService): NotifierBackend => ({
        async notify(userId, input) {
          const created = await notifications.createNotification(userId, {
            type: 'system',
            title: input.title,
            ...(input.body ? { body: input.body } : {}),
            link: input.link ?? null,
          })
          return { id: created.id }
        },
      }),
    },
    {
      // #1931 L2 — chaque port est une forme ÉTROITE. `mailDraftPortFrom` ne
      // recopie que `createDraft` : `MailboxService.sendBatch` n'atteint jamais le
      // routeur (doctrine : le copilote n'envoie pas d'e-mail — absence de code).
      provide: ACTION_ROUTER_PORTS,
      inject: [
        ContactEnrichmentService,
        IaClient,
        MailboxService,
        RoutinesService,
        NotificationsService,
        DealStageSlaService,
        MemoryService,
        CrmWriteService,
        ProjectsService,
      ],
      useFactory: (
        enrichment: ContactEnrichmentService,
        ia: IaClient,
        mailbox: MailboxService,
        routines: RoutinesService,
        notifications: NotificationsService,
        stageSla: DealStageSlaService,
        memory: MemoryService,
        crmWrites: CrmWriteService,
        projects: ProjectsService,
      ): ActionRouterPorts => ({
        enrichmentJobs: enrichmentJobsPortFrom(enrichment),
        messageDrafts: messageDraftPortFrom(ia),
        mailDrafts: mailDraftPortFrom(mailbox),
        routines: routinePortFrom(routines),
        settings: settingsPortFrom({ notifications, stageSla }),
        memory: memoryPortFrom(memory),
        // #4185 / #4186 — la porte commune : registre des adaptateurs + porte
        // d'écriture + résultat consigné, pour tout CRM hors HubSpot.
        crmWrites: crmWritesPortFrom(crmWrites),
        projects: projectsPortFrom(projects),
      }),
    },
  ],
  exports: [ActionRouterService],
})
export class ActionRouterModule {}
