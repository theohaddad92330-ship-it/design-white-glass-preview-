import { Module } from '@nestjs/common'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import { LinkedInSendLogEntity } from '../../database/entities/linkedin-send-log.entity'
import { CrmModule } from '../crm/crm.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { IaModule } from '../ia/ia.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LinkedInController } from './linkedin.controller'
import { LinkedInMandateService } from './linkedin-mandate.service'
import { UnipileHttpTransport, UnipileLinkedInSender } from './linkedin-sender'
import { LinkedInService } from './linkedin.service'

/**
 * LinkedIn sans scraping (décision Louis du 03/08).
 *
 * Module autonome (règle #7). Il importe le CRM pour y journaliser une
 * interaction quand il y en a un, et l'IA pour les sujets de publication, la messagerie pour arrêter les relances
 * quand une réponse est déclarée ; rien
 * n'importe LinkedIn.
 */
@Module({
  imports: [
    WorkspaceModule,
    IaModule,
    CrmModule,
    EsnProfileModule,
    // #4181.1 — l'arrêt des relances sur réponse reçue.
    MailboxModule,
    TypeOrmModule.forFeature([
      LinkedInInteractionEntity,
      ContactEntity,
      OutreachDelegationEntity,
      LinkedInSendLogEntity,
    ]),
  ],
  controllers: [LinkedInController],
  providers: [
    LinkedInService,
    // #4737 — la voie par FOURNISSEUR établi (Unipile), SANS CLÉ = NO-OP STRICT (`UNIPILE_API_KEY`,
    // `UNIPILE_DSN`, cf. agent_docs/env-reference.md). Nous ne touchons jamais au cookie du client.
    // Aucune liaison de compte client n'est encore livrée : `accountRefOf` rend null, donc la voie
    // reste « non ouverte » pour tout le monde — jamais un compte deviné.
    {
      provide: UnipileLinkedInSender,
      useFactory: () =>
        new UnipileLinkedInSender({
          apiKey: process.env['UNIPILE_API_KEY'],
          dsn: process.env['UNIPILE_DSN'],
          transport: new UnipileHttpTransport(),
          accountRefOf: async () => null,
        }),
    },
    {
      provide: LinkedInMandateService,
      inject: [
        getRepositoryToken(OutreachDelegationEntity),
        getRepositoryToken(LinkedInSendLogEntity),
        getRepositoryToken(LinkedInInteractionEntity),
        getRepositoryToken(ContactEntity),
        WorkspaceContextService,
        UnipileLinkedInSender,
      ],
      useFactory: (
        mandates: Repository<OutreachDelegationEntity>,
        log: Repository<LinkedInSendLogEntity>,
        interactions: Repository<LinkedInInteractionEntity>,
        contacts: Repository<ContactEntity>,
        workspace: WorkspaceContextService,
        sender: UnipileLinkedInSender,
      ) => new LinkedInMandateService(mandates, log, interactions, contacts, workspace, sender),
    },
  ],
  exports: [LinkedInService],
})
export class LinkedInModule {}
