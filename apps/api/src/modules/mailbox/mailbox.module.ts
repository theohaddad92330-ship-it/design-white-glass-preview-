import { Module, forwardRef } from '@nestjs/common'
import { ActivitiesModule } from '../activities/activities.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MailBatchEntity } from '../../database/entities/mail-batch.entity'
import { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { GoogleModule } from '../google/google.module'
import { MailerModule } from '../mailer/mailer.module'
import { MicrosoftModule } from '../microsoft/microsoft.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { GoogleMailBackend } from './google-mail.backend'
import { MAILBOX_BACKENDS } from './mailbox-backend'
import { MailboxController } from './mailbox.controller'
import { MailboxReplySweeper } from './mailbox-reply.sweeper'
import { MailThreadStateController } from './mail-thread-state.controller'
import { MailThreadStateService } from './mail-thread-state.service'
import { MailboxService } from './mailbox.service'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { MAILBOX_SINGLETON_LOCK, type MailboxUnderSingletonLock } from './module-tokens'
import { MicrosoftMailBackend } from './microsoft-mail.backend'

/**
 * La CAPACITÉ « messagerie », au-dessus des deux intégrations qui la servent.
 *
 * Module autonome (règle #7) : le retirer ne casse ni Google ni Microsoft —
 * seulement les écrans qui parlent de « ta messagerie ». Il possède UNE table,
 * `mail_thread_marks` (#2104.6/.7/.8 — traité, non pertinent, rattachement
 * manuel) : une décision personnelle sur un fil, jamais partagée ailleurs.
 *
 * L'ordre des backends est l'ordre de préférence quand deux messageries sont
 * connectées en même temps. Google d'abord parce que c'est la connexion
 * majoritaire chez les ESN françaises visées ; rien d'autre n'en dépend.
 */
@Module({
  imports: [
    GoogleModule,
    MicrosoftModule,
    MailerModule,
    WorkspaceModule,
    // `ContactEntity` : le rattachement d'un fil à son compte (MAIL-01) se fait
    // sur les adresses des contacts du portefeuille. `AccountEntity` : vérifier
    // qu'un rattachement MANUEL (#2104.6) désigne un compte du bon espace.
    // `ChatMessageEntity` (#2955, #2394.57) : LECTURE SEULE de
    // `context.mail_threads`, l'état de conversation déjà persisté par
    // `ChatMessagesService.create` — une entité est un schéma partagé (règle
    // §3.2, GA-07 hors périmètre), jamais un service voisin importé, et ce
    // module n'écrit JAMAIS dans `chat_messages`.
    TypeOrmModule.forFeature([
      ProfileEntity,
      MailBatchEntity,
      ContactEntity,
      MailThreadMarkEntity,
      AccountEntity,
      ChatMessageEntity,
    ]),
    // La trace d'un brouillon déposé (PDF 6 §5.2 règle f).
    //
    // `forwardRef` parce que le cycle est RÉEL et légitime : `ActivitiesModule`
    // nous importe pour LIRE la messagerie (la capture d'activités relit les
    // fils), et nous l'importons pour ÉCRIRE la trace d'un brouillon. Ce sont
    // deux directions différentes du même échange, pas une erreur de découpage.
    forwardRef(() => ActivitiesModule),
    // #2875/#2402.3 (lot V11) — le registre unique des déclencheurs
    // commerciaux. Module autonome : le retirer éteint seulement la
    // persistance canonique d'une réponse positive, jamais la réconciliation
    // séquence/réponse elle-même (`@Optional()` sur le service, voir
    // `mailbox.service.ts`).
    TriggerRegistryModule,
    // #3718.6 — le verrou de tick du balayage horaire des réponses (un seul réplica).
    LocksModule,
  ],
  controllers: [MailboxController, MailThreadStateController],
  providers: [
    GoogleMailBackend,
    MicrosoftMailBackend,
    MailboxService,
    MailThreadStateService,
    MailboxReplySweeper,
    {
      provide: MAILBOX_SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): MailboxUnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
    {
      provide: MAILBOX_BACKENDS,
      useFactory: (google: GoogleMailBackend, microsoft: MicrosoftMailBackend) => [google, microsoft],
      inject: [GoogleMailBackend, MicrosoftMailBackend],
    },
  ],
  exports: [MailboxService],
})
export class MailboxModule {}
