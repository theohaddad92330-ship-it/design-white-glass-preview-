import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { isSuccess } from '@bellum/utils'
import { mailSearchRequestSchema } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { ScheduledMessageSendEntity } from '../../database/entities/scheduled-message-send.entity'
import { ContactsModule } from '../contacts/contacts.module'
import { ContactsService } from '../contacts/contacts.service'
import { MailboxModule } from '../mailbox/mailbox.module'
import { MailboxService } from '../mailbox/mailbox.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SCHEDULED_SEND_CLOCK, SCHEDULED_SEND_TRANSPORT, type ScheduledSendTransport } from './module-tokens'
import { ScheduledSendController } from './scheduled-send.controller'
import { SCHEDULED_SEND_QUEUE } from './scheduled-send.queue'
import { ScheduledSendService } from './scheduled-send.service'
import { ScheduledSendWorker } from './scheduled-send.worker'

/**
 * Théo M2 — envoi programmé — module autonome (règle n°7) : le retirer retire `/message-drafts/scheduled-sends` et
 * la file différée, rien d'autre. Ce qu'il emprunte passe par `SCHEDULED_SEND_TRANSPORT`, câblé ICI.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: SCHEDULED_SEND_QUEUE }),
    TypeOrmModule.forFeature([
      ScheduledMessageSendEntity,
      MessageDraftVersionEntity,
      MessageDraftValidationEntity,
      ContactEntity,
    ]),
    WorkspaceModule,
    ContactsModule,
    MailboxModule,
  ],
  controllers: [ScheduledSendController],
  providers: [
    ScheduledSendService,
    ScheduledSendWorker,
    { provide: SCHEDULED_SEND_CLOCK, useValue: () => new Date() },
    {
      provide: SCHEDULED_SEND_TRANSPORT,
      inject: [ContactsService, MailboxService, WorkspaceContextService],
      useFactory: (
        contacts: ContactsService,
        mailbox: MailboxService,
        workspaceContext: WorkspaceContextService,
      ): ScheduledSendTransport => ({
        activeWorkspace: async userId => (await workspaceContext.resolveActiveWorkspace(userId)).workspaceId,
        // LE chemin de « Envoyer » au clic, canal `mailbox` : la boîte du commercial, jamais l'adresse de l'espace.
        sendEmail: async (contactId, userId, draft) => {
          const result = await contacts.sendEmail(contactId, userId, undefined, draft, 'mailbox')
          return isSuccess(result) ? { ok: true } : { ok: false, code: result.problem.code }
        },
        lookForSentProof: async (userId, counterpartEmail) => {
          await mailbox.search(
            userId,
            mailSearchRequestSchema.parse({ intent: 'free', counterpart: counterpartEmail, windowDays: 2, limit: 5 }),
          )
        },
      }),
    },
  ],
})
export class ScheduledSendModule {}
