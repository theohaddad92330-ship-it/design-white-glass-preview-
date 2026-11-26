import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactLifecycleTransitionEntity } from '../../database/entities/contact-lifecycle-transition.entity'
import { ContactDuplicateDecisionEntity } from '../../database/entities/contact-duplicate-decision.entity'
import { ContactMergeEntity } from '../../database/entities/contact-merge.entity'
import { ContactResolutionCorrectionEntity } from '../../database/entities/contact-resolution-correction.entity'
// #2297.41/.42/.49/.50 — même table que `contact-stop.module.ts`
// (`ContactStopService.verdict`), lue ici directement (GA-07) plutôt que
// d'importer ce module : aucun cycle, aucune logique dupliquée.
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { ContactIntakeExclusionEntity } from '../../database/entities/contact-intake-exclusion.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { CreditReservationModule } from '../action-os/credit-reservation.module'
import { CreditsModule } from '../credits/credits.module'
import { CreditsService } from '../credits/credits.service'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { MailerModule } from '../mailer/mailer.module'
import { SprintsModule } from '../sprints/sprints.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CadenceService } from './cadence.service'
import { ActionsModule } from '../actions/actions.module'
import { SendTimingService } from '../actions/send-timing.service'
import { WorkspaceCommercialLoadSettingsService } from '../workspace/workspace-commercial-load-settings.service'
import { cadencePreferredWeekdayReader } from './cadence-weekday-reader'
import { BackofficeAlertDispatchService } from '../backoffice-alerts/backoffice-alert-dispatch.service'
import { enrichmentOutageAlert } from '../backoffice-alerts/backoffice-alert-dispatch'
import { MailboxModule } from '../mailbox/mailbox.module'
import { MailboxService } from '../mailbox/mailbox.service'
import { EmailAttachmentModule } from '../outreach-assets/email-attachment.module'
import { EmailAttachmentService } from '../outreach-assets/email-attachment.service'
import { ESTIMATED_FIELD_SOURCE } from '@bellum/contracts'
import { ProvenanceService } from '../crm-core/provenance.service'
import { SuppressionService } from '../mailer/suppression.service'
import { EmailEstimateService } from './email-estimate.service'
import { probeMailbox, realMailboxProbeDeps } from './email-probe'
import {
  CADENCE_PREFERRED_WEEKDAY,
  EMAIL_ESTIMATE_PORTS,
  EMAIL_ESTIMATE_PROBE,
  type EmailEstimatePorts,
  type EmailEstimateProbe,
  ENRICHMENT_OUTAGE_ALERT,
  INDIVIDUAL_MAILBOX_SENDER,
  EMAIL_ATTACHMENTS,
  type EmailAttachments,
  PHONE_REVEAL_DEBIT,
  type PhoneRevealDebit,
  type EnrichmentOutageAlert,
  type IndividualMailboxSender,
} from './module-tokens'
import { CONTACT_ENRICHMENT_QUEUE, CONTACT_ENRICHMENT_JOB_OPTIONS } from './contact-enrichment.queue'
import { ContactEnrichmentService } from './contact-enrichment.service'
import { ContactReachabilityCatchupService } from './contact-reachability-catchup.service'
import { InvalidPhoneArchiveService } from './invalid-phone-archive.service'
import { LockedEmailCatchupController } from './locked-email-catchup.controller'
import { LockedEmailCatchupService } from './locked-email-catchup.service'
import { PlaceholderEmailCatchupController } from './placeholder-email-catchup.controller'
import { PlaceholderEmailCatchupService } from './placeholder-email-catchup.service'
import { WorkspacePlaceholderEmailCatchupController } from './workspace-placeholder-email-catchup.controller'
import { ContactPhoneRevealService } from './contact-phone-reveal.service'
import { ContactPhoneRevealWebhookController } from './contact-phone-reveal-webhook.controller'
import { PhoneRevealWebhookGuard } from './phone-reveal-webhook.guard'
import { PersonErasureService } from './person-erasure.service'
import { CONTEXT_PACK_ORIGINAL_ERASER, type ContextPackOriginalEraser } from './person-erasure-context-pack-originals'
import { ContextPackOriginalsModule } from '../universal-import/context-pack-originals.module'
import { ContextPackOriginalsService } from '../universal-import/context-pack-originals.service'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { EsnTargetPersonaEntity } from '../../database/entities/esn-target-persona.entity'
import { ContactEnrichmentWorker } from './contact-enrichment.worker'
import { EmploymentRecheckRequester } from './employment-recheck.requester'
import { EMPLOYMENT_RECHECK_QUEUE } from '../routines/employment-check'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { ContactResolutionCorrectionsController } from './contact-resolution-corrections.controller'
import { ContactResolutionCorrectionsService } from './contact-resolution-corrections.service'
import { DropcontactClient } from './dropcontact.client'
import { ContactEmailNameBackfillController } from './contact-email-name-backfill.controller'
import { ContactEmailNameBackfillService } from './contact-email-name-backfill.service'
import { ContactDuplicateDecisionsService } from './contact-duplicate-decisions.service'
import { EnrichmentProviders } from './enrichment-providers'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
// #2126.56/.58 — l'exclusion « fiche marquée incorrecte » du classement et des
// recommandations. Sens unique : OutcomesModule ne nous importe jamais.
import { OutcomesModule } from '../outcomes/outcomes.module'
// #2733 — le webhook Resend a besoin de `ContactsService` (`applyEmailBounce`) ;
// il vit ici plutôt que dans `MailerModule` pour ne pas créer de cycle
// (`contacts` importe déjà `mailer`, jamais l'inverse).
import { ResendWebhookController } from './resend-webhook.controller'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'

@Module({
  imports: [
    // #4573 — l'original des imports de pack, effacé avec la personne (c67). Ne dépend que du stockage : aucun cycle.
    ContextPackOriginalsModule,
    // #3699.4 — la boîte connectée (envoi individuel). Sens unique : `MailboxModule` n'importe jamais ce module.
    MailboxModule,
    // LUDOVIC-C LC.1 — le profil (pack, zones) réordonne le chemin à la lecture. Module léger,
    // sans Auth ni Mailer : aucun cycle.
    EsnProfileReaderModule,
    // Le cloisonnement de périmètre (BU) : un contact hérite du périmètre de
    // SON COMPTE. Module autonome (il n'importe que WorkspaceModule) : aucun cycle.
    BusinessUnitModule,
    // #3289.29 — le timing appris (jour recommandé) cale les échéances de cadence.
    ActionsModule,
    // #2126.56/.58 — la porte d'éligibilité lit les fiches marquées incorrectes.
    OutcomesModule,
    // ActionPlanItemEntity: the cadence engine (Drive #8) materialises relance
    // follow-ups as dated plan items so the existing "Rappels de relance" cron
    // reminds them — reusing the same table/cron, no duplication.
    TypeOrmModule.forFeature([
      ContactEntity,
      ContactLifecycleTransitionEntity,
      ContactMergeEntity,
      // #4114.4 — « ce sont les mêmes » / « pas les mêmes » sur une paire de doublons proposée.
      ContactDuplicateDecisionEntity,
      UserActionEntity,
      ActivityEntity,
      ActionPlanItemEntity,
      AccountEntity,
      // #2120.48 — « Confronter avec mon CRM » lit cette table pour savoir si
      // UN CRM est branché sur l'espace, tous fournisseurs confondus.
      CrmConnectionEntity,
      // #2297 — les empreintes des personnes effacées, lues à l'entrée de la
      // collecte et de l'enrichissement (injectées SANS `@Optional()`).
      PersonErasureEntity,
      // #3754 — les postes cibles de l'ESN (niveau décideur), lus par le classement.
      EsnTargetPersonaEntity,
      // #2297.41/.42/.49/.50 — la porte PERSONNE, lue avant l'appel
      // fournisseur payant (injectée `@Optional()` côté service).
      ContactStopEntity,
      // #2309.16/.19 — un candidat jamais devenu une fiche (identité ambiguë / doublon).
      ContactIntakeExclusionEntity,
      // #2159.35 — la correction de rapprochement de contact, versionnée par l'espace.
      ContactResolutionCorrectionEntity,
    ]),
    CreditsModule,
    MailerModule,
    WorkspaceModule,
    // Arbitre de provenance : c'est lui qui empêche l'enrichissement d'écraser
    // une adresse saisie à la main. On importe le module au lieu de recopier la
    // règle — deux implémentations de « human > pipeline » finiraient par
    // diverger, et la divergence se paierait en corrections effacées.
    CrmCoreModule,
    // Board de sprints (tome 5, m13) : une réponse positive / un RDV obtenu
    // fait basculer l'effort du compte — `SprintsService.applyEvent` a enfin
    // un appelant.
    SprintsModule,
    // Enrichissement à la demande en tâche de fond : le clic met en file et rend
    // la main, la cascade fournisseur (30-85 s) tourne dans le worker.
    BullModule.registerQueue({
      name: CONTACT_ENRICHMENT_QUEUE,
      defaultJobOptions: CONTACT_ENRICHMENT_JOB_OPTIONS,
    }),
    // #4286.13 — l'ouverture d'une fiche enfile la relecture d'employeur (exécutée par le module des routines).
    BullModule.registerQueue({ name: EMPLOYMENT_RECHECK_QUEUE }),
    // #1931 L2 (I3) — le worker solde la réservation posée au clic d'une carte
    // de Laura au moment où il observe le débit. Module FEUILLE (il n'importe que
    // son entité) : aucun cycle avec Action OS, qui importe ce module-ci.
    CreditReservationModule,
    // #3699.6 — les pièces jointes d'un envoi individuel (module feuille : n'importe pas ce module).
    EmailAttachmentModule,
  ],
  controllers: [
    ContactsController,
    // #4586 — le rattrapage des fiches nommées par leur adresse (porte d'opérateur, jamais automatique).
    ContactEmailNameBackfillController,
    // #4599 — le rattrapage des adresses gabarit (même porte d'opérateur, simulation par défaut).
    PlaceholderEmailCatchupController,
    LockedEmailCatchupController,
    // #4599.4 — la porte d'admin d'espace (simulation puis exécution bornée), à côté de la porte interne.
    WorkspacePlaceholderEmailCatchupController,
    ResendWebhookController,
    ContactResolutionCorrectionsController,
    // E1 (#3698) — le mobile révélé par Apollo, livré sur un endpoint public signé.
    ContactPhoneRevealWebhookController,
  ],
  providers: [
    ContactsService,
    ContactDuplicateDecisionsService,
    ContactEmailNameBackfillService,
    // #3698.6 — fourni ici directement, comme `DemoModule` (l'importer via
    // `BackofficeAlertsModule` ouvrirait un cycle par `AdminModule`). Sans état
    // hors Redis/env : une seconde instance ne divise rien.
    BackofficeAlertDispatchService,
    {
      // #3699.4 — l'envoi individuel depuis la boîte connectée : même chemin
      // d'envoi que le lot, jamais un second moteur.
      provide: INDIVIDUAL_MAILBOX_SENDER,
      inject: [MailboxService],
      useFactory: (mailbox: MailboxService): IndividualMailboxSender => ({
        status: (userId, senderConnectionId) => mailbox.individualSendStatus(userId, senderConnectionId),
        // #4546.5 — l'expéditeur désigné voyage dans l'item : la boîte par défaut garde son appel d'avant.
        send: (userId, { senderConnectionId, ...item }) => mailbox.sendIndividual(userId, item, senderConnectionId),
        // #4412 — le brouillon passe par `MailboxService.createDraft`, jamais un second chemin d'écriture.
        draft: (userId, item) => mailbox.createContactDraft(userId, item),
      }),
    },
    {
      // #3699.6 — les pièces jointes d'un envoi individuel, choisies par le commercial.
      provide: EMAIL_ATTACHMENTS,
      inject: [EmailAttachmentService],
      useFactory: (service: EmailAttachmentService): EmailAttachments => ({
        attachableFor: (workspaceId, contactId) => service.attachableFor(workspaceId, contactId),
        resolveForSend: (workspaceId, contactId, assetIds) => service.resolveForSend(workspaceId, contactId, assetIds),
      }),
    },
    {
      provide: ENRICHMENT_OUTAGE_ALERT,
      inject: [BackofficeAlertDispatchService],
      useFactory:
        (dispatch: BackofficeAlertDispatchService): EnrichmentOutageAlert =>
        async reason => {
          const { title, detail } = enrichmentOutageAlert(reason)
          await dispatch.dispatch({
            kind: 'enrichissement_indisponible',
            subject: reason,
            title,
            detail,
            resolved: false,
          })
        },
    },
    ContactEnrichmentService,
    ContactReachabilityCatchupService,
    // #3850.1 — l'archivage ciblé des téléphones déjà en base invalides.
    InvalidPhoneArchiveService,
    PlaceholderEmailCatchupService,
    LockedEmailCatchupService,
    // E1 (#3698) — la révélation du mobile Apollo (demande + livraison signée).
    ContactPhoneRevealService,
    {
      provide: PHONE_REVEAL_DEBIT,
      inject: [CreditsService],
      useFactory:
        (credits: CreditsService): PhoneRevealDebit =>
        (userId, context) =>
          credits.consumeEnrichmentCredit(userId, context),
    },
    PhoneRevealWebhookGuard,
    ContactResolutionCorrectionsService,
    // #2297 — l'effacement d'une personne (RGPD art. 17), route `POST /contacts/:id/erasure`.
    PersonErasureService,
    // #4573 — il emporte les originaux des imports de pack de l'espace (port, GA-07).
    {
      provide: CONTEXT_PACK_ORIGINAL_ERASER,
      inject: [ContextPackOriginalsService],
      useFactory:
        (originals: ContextPackOriginalsService): ContextPackOriginalEraser =>
        workspaceId =>
          originals.eraseWorkspaceOriginals(workspaceId),
    },
    // #4016 L4.1 — l'e-mail estimé (motif de l'entreprise, vérifié MX + SMTP).
    // Les portes passent par des jetons (GA-07) : opposition et provenance.
    EmailEstimateService,
    {
      provide: EMAIL_ESTIMATE_PORTS,
      inject: [SuppressionService, ProvenanceService],
      useFactory: (suppressions: SuppressionService, provenance: ProvenanceService): EmailEstimatePorts => ({
        isSuppressed: (workspaceId, email) => suppressions.isSuppressed(workspaceId, email),
        currentSources: contactId => provenance.currentSources('contact', contactId),
        commitEstimate: ({ workspaceId, contactId, email, rule }) =>
          provenance.commit({
            workspaceId,
            entityType: 'contact',
            entityId: contactId,
            source: ESTIMATED_FIELD_SOURCE,
            actorId: null,
            rule,
            changes: [{ field: 'email', oldValue: null, newValue: email }],
          }),
      }),
    },
    {
      provide: EMAIL_ESTIMATE_PROBE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailEstimateProbe => {
        const timeoutMs = Number(config.get('emailEstimateProbeTimeoutMs') ?? 0)
        return email => probeMailbox(email, realMailboxProbeDeps(timeoutMs))
      },
    },
    ContactEnrichmentWorker,
    EmploymentRecheckRequester,
    CadenceService,
    // #3289.29 — le jeton, jamais le service : voir `module-tokens.ts`. Seul le
    // créneau e-mail compte (les relances de cadence sont des e-mails).
    {
      provide: CADENCE_PREFERRED_WEEKDAY,
      inject: [
        { token: WorkspaceCommercialLoadSettingsService, optional: true },
        { token: SendTimingService, optional: true },
      ],
      // Le jour IMPOSÉ par l'espace (réglage) prime sur le jour APPRIS — voir `cadence-weekday-reader.ts`.
      useFactory: cadencePreferredWeekdayReader,
    },
    // Factory so the client's optional tuning arg (poll interval/attempts) isn't
    // reflected as a DI dependency — it just reads the env-gated key off config.
    EnrichmentProviders,
    {
      provide: DropcontactClient,
      useFactory: (config: ConfigService): DropcontactClient => new DropcontactClient(config),
      inject: [ConfigService],
    },
  ],
  // `ContactEnrichmentService` — #1931 L2 (D4) : le routeur d'actions met en file
  // l'enrichissement d'une carte sur la MÊME file que le bouton de l'écran.
  exports: [
    ContactsService,
    CadenceService,
    ContactEnrichmentService,
    ContactReachabilityCatchupService,
    InvalidPhoneArchiveService,
    PlaceholderEmailCatchupService,
    ContactResolutionCorrectionsService,
  ],
})
export class ContactsModule {}
