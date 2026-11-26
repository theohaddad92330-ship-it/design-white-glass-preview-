import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClearRefreshCookieInterceptor } from '../../common/interceptor/refresh-cookie.interceptor'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatConversationEntity } from '../../database/entities/chat-conversation.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatReplyMemoryUseEntity } from '../../database/entities/chat-reply-memory-use.entity'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { ChatThreadTitleEntity } from '../../database/entities/chat-thread-title.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { PrivacyExportAuditLogEntity } from '../../database/entities/privacy-export-audit-log.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { BackofficeAccessJournalModule } from '../admin/backoffice-access-journal.module'
import { LocksModule } from '../locks/locks.module'
import { ConsultantsModule } from '../consultants/consultants.module'
import { StorageModule } from '../storage/storage.module'
import { StorageService } from '../storage/storage.service'
import { VOICE_MESSAGE_ERASER, voiceMessageEraserFrom } from './voice-message-eraser'
import { IMAGE_ATTACHMENT_ERASER, imageAttachmentEraserFrom } from './image-attachment-eraser'
import { PrivacyController } from './privacy.controller'
import { PrivacyDeletionService } from './privacy-deletion.service'
import { PrivacyExportAuditService } from './privacy-export-audit.service'
import { PrivacyExportService } from './privacy-export.service'
import { PrivacyPortabilityService } from './privacy-portability.service'
import { PrivacyRetentionService } from './privacy-retention.service'

/**
 * RGPD module (data privacy §11): self-serve export (art. 15/20), right to
 * erasure by anonymisation (art. 17), and the retention framework (art. 5-1-e).
 *
 * Autonomous (repo rule #7): it only depends on globally-provided services
 * (`StripeService`, `ConfigService`) and the shared TypeORM repositories, so it
 * can be removed without touching any other module. `StripeService` is `@Global`
 * (StripeModule) and needs no explicit import here.
 */
@Module({
  imports: [
    // La purge à douze mois du journal d'accès du back-office (#1671.2) se greffe
    // sur le balayage de 04:17 : le dépôt porte déjà 23 déclencheurs, et une
    // heure de plus à surveiller n'aurait rien apporté. Le module est autonome —
    // le retirer laisse la rétention balayer tout le reste, sans prétendre avoir
    // purgé ce qu'elle n'a pas purgé.
    BackofficeAccessJournalModule,
    TypeOrmModule.forFeature([
      ProfileEntity,
      EsnProfileEntity,
      SubscriptionEntity,
      AccountEntity,
      ContactEntity,
      ConsultantEntity,
      RagDocumentEntity,
      ActivityEntity,
      // #1939 — les échanges avec Laura et la mémoire personnelle du copilote,
      // anonymisés par `PrivacyDeletionService` au même titre que le reste.
      ChatMessageEntity,
      // #2439.13 — les conservations légales, lues (jamais écrites) pour
      // épargner l'attribution des messages qu'elles couvrent.
      ChatConversationEntity,
      ConversationSummaryEntity,
      MemoryPinnedFactEntity,
      // #1916.23 / Q1 — l'auteur d'un geste de l'historique d'un élément de
      // mémoire, retiré à l'effacement d'un compte (GA-20 : injecté, donc déclaré).
      MemoryFactEventEntity,
      UserPreferenceEntity,
      // #1939 — décision Louis 13/09 : mémoire personnelle EFFACÉE (pour de
      // bon) à la suppression d'un compte, même geste que
      // `MemoryService.forgetMine('refusals')`.
      LauraInterventionEntity,
      // #1919 — les retours de la personne sur les réponses de Laura, supprimés
      // du même geste (GA-20 : un dépôt injecté est déclaré ici).
      ChatReplyFeedbackEntity,
      // #1939 × #1911.1 — l'auteur d'un titre de fil, anonymisé à la suppression.
      ChatThreadTitleEntity,
      // #1916.24 — les traces des éléments de mémoire envoyés pour les réponses
      // de la personne, supprimées avec son compte (GA-20 : injecté, déclaré).
      ChatReplyMemoryUseEntity,
      // #1938.4 — le numéro saisi pour les alertes SMS : dans l'export, compté
      // à l'écran « Mes données », SUPPRIMÉ à l'effacement du compte.
      NotificationSmsChannelEntity,
      UserActionEntity,
      CreditLedgerEntity,
      UserSessionEntity,
      WorkspaceEntity,
      // Le flux d'évènements produit — lu (jamais écrit) pour répondre à
      // « dernier export : … » sans ajouter une colonne à tenir à jour.
      ProductEventEntity,
      // #2439.15 — l'audit de chaque export, écrit (jamais lu) par ce module.
      PrivacyExportAuditLogEntity,
    ]),
    // Cron-tick lock for the retention sweep (multi-replica safety).
    LocksModule,
    // Le vivier : le balayage quotidien efface aussi les dossiers de
    // CANDIDATURE échus, pour les espaces qui ont armé leur politique. La
    // dépendance est à sens unique — le vivier ne connaît pas la vie privée.
    ConsultantsModule,
    // #1939.9 — l'effacement IMMÉDIAT des enregistrements vocaux d'un compte
    // supprimé. Dépendance à sens unique : le stockage ne connaît pas la vie
    // privée, et ce module n'en appelle qu'une méthode, bornée au domaine vocal.
    StorageModule,
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyExportService,
    PrivacyExportAuditService,
    PrivacyPortabilityService,
    PrivacyDeletionService,
    // #1939.9 — le port d'effacement IMMÉDIAT de la voix d'un compte supprimé,
    // branché ICI, dans la couche de composition, et non importé par le service
    // (GA-07). Il n'appelle qu'une méthode du stockage, bornée au domaine vocal.
    { provide: VOICE_MESSAGE_ERASER, useFactory: voiceMessageEraserFrom, inject: [StorageService] },
    // #2876 (#2433.4) — même geste, sur le domaine des images de chat.
    { provide: IMAGE_ATTACHMENT_ERASER, useFactory: imageAttachmentEraserFrom, inject: [StorageService] },
    PrivacyRetentionService,
    // Provided locally so `@UseInterceptors(ClearRefreshCookieInterceptor)` on the
    // delete endpoint resolves with its ConfigService dependency injected.
    ClearRefreshCookieInterceptor,
  ],
})
export class PrivacyModule {}
