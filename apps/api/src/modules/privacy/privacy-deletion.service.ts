import { localDayKey } from '@bellum/contracts'
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { In, IsNull, Not, Repository } from 'typeorm'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ChatConversationEntity } from '../../database/entities/chat-conversation.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatReplyMemoryUseEntity } from '../../database/entities/chat-reply-memory-use.entity'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { ChatThreadTitleEntity } from '../../database/entities/chat-thread-title.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { StripeService } from '../stripe/stripe.service'
import { VOICE_MESSAGE_ERASER, type VoiceMessageEraser } from './voice-message-eraser'
import { IMAGE_ATTACHMENT_ERASER, type ImageAttachmentEraser } from './image-attachment-eraser'

/** The exact phrase the client must echo to authorise an irreversible deletion. */
export const DELETION_CONFIRMATION = 'SUPPRIMER'

/** Placeholder written over free-text PII columns on anonymisation. */
const REDACTED = '[supprimé]'

/**
 * What a deletion actually did, so the API response (and audit log) can be
 * honest about what was scrubbed vs. cancelled vs. deliberately kept.
 */
export type DeletionSummary = {
  /** PII scrubbed in place (row kept, personal fields overwritten). */
  anonymized: {
    profile: boolean
    /** Number of prospect contacts scrubbed. */
    contacts: number
    /**
     * Number of vivier talents scrubbed — consultants AND candidates.
     *
     * Missing until 2026-08-20 despite arbitrage #7 of 16/08 promising the
     * wiring. A talent row carries the most personal payload of the schema (a
     * CV in plain text), and an erasure that left it behind was not an erasure.
     */
    consultants: number
    /** Number of uploaded documents whose content was cleared. */
    ragDocuments: number
    /**
     * Number of activity rows whose body/subject were cleared.
     *
     * Manquait jusqu'au 2026-09-12 (finding pentest #7) : le corps INTÉGRAL des
     * e-mails/appels vit dans `activities.body` (arbitrage 16/08), et une
     * suppression de compte le laissait en base — le texte des messages d'un
     * compte effacé restait lisible pour toujours. On scrube le contenu
     * personnel, on garde les métadonnées non nominatives (canal, date, compte).
     */
    activities: number
    /**
     * Nombre de messages Laura dont l'AUTEUR a été retiré (#1939, RGPD art. 17).
     *
     * Manquait jusqu'au 2026-09-12 : `chat_messages` n'était touché nulle part
     * dans cette méthode, et un compte supprimé laissait ses échanges avec
     * Laura en base pour toujours. Contrairement aux activités, le CONTENU
     * n'est PAS scrubé — un fil de discussion est PARTAGÉ DE L'ESPACE
     * (`ChatMessagesService` lit par `workspace_id`, jamais `user_id`) : le
     * vider couperait l'historique des collègues qui le lisent encore. Seul le
     * lien vers la personne disparaît.
     */
    chatMessages: number
    /**
     * #2439.13 — nombre de messages dont l'auteur N'A PAS été retiré parce
     * qu'ils appartiennent à une conversation sous CONSERVATION LÉGALE
     * (`chat_conversations.legal_hold_at`, posée par un gérant,
     * `ChatConversationsService.setLegalHold`). Une conservation légale
     * protège l'attribution le temps qu'elle court : l'effacement RGPD de la
     * personne reste dû, mais se rejoue sur ces messages précis dès la levée
     * de la conservation (le prochain effacement les retrouvera, la ligne
     * `user_id` n'ayant pas bougé).
     */
    chatMessagesKeptForLegalHold: number
    /** Nombre de résumés de conversation vidés (portée strictement
     *  personnelle — `ConversationSummaryEntity` n'est jamais partagée). */
    conversationSummaries: number
    /**
     * Nombre de faits épinglés dont l'AUTEUR a été retiré (#1939, RGPD art. 17).
     *
     * Corrigé le 12/09 : la première version rédigeait le TEXTE (`fact`),
     * mais `memory_pinned_facts` est une mémoire PARTAGÉE de l'espace
     * (`MemoryService.listFacts` filtre par `workspace_id` seul) — rédiger le
     * texte aurait affiché « [supprimé] » à un collègue et l'aurait envoyé au
     * modèle comme un fait réel. Même geste que `chatMessages` : le contenu
     * reste, seul le lien vers la personne disparaît.
     */
    memoryFacts: number
    /**
     * Q1 (13/09) — nombre d'éléments de mémoire dont le CONFIRMATEUR
     * (`confirmed_by`) a été retiré. La note reste confirmée (`confirmed_at`),
     * seul le lien vers la personne part — l'écran dit « confirmée » sans prénom.
     */
    memoryFactConfirmations: number
    /**
     * #1916.23 — nombre de gestes de l'historique de la mémoire dont l'AUTEUR
     * (`actor_user_id`) a été retiré. Le geste reste : l'histoire d'un élément
     * partagé appartient à l'espace.
     */
    memoryFactEvents: number
    /**
     * Nombre de titres de fil dont l'AUTEUR (`set_by`) a été retiré (#1939 ×
     * #1911.1, revue d'intégration du 13/09). Le titre nomme un fil partagé de
     * l'espace : il reste, seul le lien vers la personne disparaît.
     */
    threadTitles: number
    /** Le sac de préférences personnelles a été vidé (table à une ligne par
     *  utilisateur, jamais partagée). */
    preferencesCleared: boolean
  }
  /**
   * Lignes HARD-supprimées (#1939, décision Louis 13/09) — la SEULE exception
   * à « cette méthode anonymise, elle ne supprime pas ». `laura_interventions`
   * est une trace comportementale strictement personnelle (jamais partagée,
   * contrairement aux fils de discussion et aux faits épinglés ci-dessus) :
   * `MemoryService.forgetMine('refusals')` la traite déjà comme une mémoire
   * qu'on OUBLIE (delete), pas qu'on scrube — même geste ici.
   */
  deleted: {
    /** Nombre de traces d'intervention proactive supprimées. */
    lauraInterventions: number
    /**
     * #1939 × #1918.1 (décision 12/09 batch 6) — nombre d'éléments de mémoire
     * « Toi uniquement » (`scope = 'user'`) SUPPRIMÉS. Contrairement aux éléments
     * PARTAGÉS (`anonymized.memoryFacts`, texte gardé), ils n'ont qu'un lecteur,
     * leur auteur : lui retirer l'auteur les rendait illisibles pour tous en
     * laissant leur texte en base.
     *
     * Nommé `personalMemoryFacts` à l'intégration du 13/09 : #1982 l'appelait
     * `deleted.memoryFacts`, homonyme de `anonymized.memoryFacts` qui compte
     * l'autre moitié. Aucun client ne lit ce champ (`privacy-api.ts` ne type
     * que `anonymized.profile/contacts/ragDocuments`).
     */
    personalMemoryFacts: number
    /**
     * #1916.24 — traces « cet élément de mémoire était dans le contexte de telle
     * réponse » posées par les questions de cette personne, supprimées. `null` =
     * non mesuré (dépôt absent), jamais « aucune ».
     */
    replyMemoryUses: number | null
    /**
     * #1919 — nombre de retours de la personne sur les réponses de Laura
     * supprimés (`chat_reply_feedback`) : sa mémoire à elle, lue dans son seul
     * prompt, jamais par un collègue.
     */
    replyFeedback: number
    /**
     * #1938.4 (décision Louis 13/09 batch 13) — le canal SMS des alertes
     * urgentes : numéro, vérification, consentement et choix. Une ligne par
     * personne, lue par elle seule, jamais partagée : supprimée, pas
     * anonymisée, pour la même raison que `lauraInterventions`. 0 ou 1.
     */
    smsChannel: number
  }
  /**
   * #1939.9 — les enregistrements VOCAUX de cette personne, EFFACÉS — pas
   * anonymisés : décision Louis du 12/09, « tout effacer tout de suite ».
   *
   * Le texte des messages reste (fil partagé, sans l'auteur) ; la VOIX n'a aucun
   * lecteur à préserver et aucune obligation de conservation. `deferredToNextPurge`
   * n'est pas zéro quand le stockage a refusé l'effacement : les lignes sont alors
   * passées échues et la purge de la nuit les reprend — la réponse le DIT, elle
   * ne prétend pas avoir effacé.
   */
  voiceMessages: { erased: number; deferredToNextPurge: number }
  /**
   * #2876 (#2433.4) — même geste, même raison, sur les images jointes au chat :
   * une capture peut porter la donnée personnelle d'un tiers, jamais une pièce
   * de l'entreprise.
   */
  imageAttachments: { erased: number; deferredToNextPurge: number }
  /** Active devices revoked (all of the user's sessions). */
  sessionsRevoked: number
  /** Whether an active Stripe subscription was cancelled (no charge). */
  subscriptionCanceled: boolean
  /** Records intentionally KEPT (legal / accounting / pseudonymous audit). */
  retained: string[]
}

/**
 * RGPD droit à l'effacement (art. 17), by ANONYMISATION rather than hard-delete.
 *
 * Personal data of a natural person is scrubbed in place; records the law
 * requires us to keep (invoices, the credit ledger, the append-only action
 * journal) are retained but only ever reference an opaque `user_id` UUID once
 * the identity is anonymised, so no personal data survives against them.
 *
 * Every write is STRICTLY scoped to the caller's `user_id` — a deletion can
 * never touch another user's rows. The flow is deliberately best-effort on the
 * external Stripe call (a billing-provider hiccup must not block the user's
 * erasure of their own data).
 */
@Injectable()
export class PrivacyDeletionService {
  private readonly logger = new Logger(PrivacyDeletionService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(RagDocumentEntity)
    private readonly ragDocuments: Repository<RagDocumentEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activities: Repository<ActivityEntity>,
    // #1939 — les échanges avec Laura et la mémoire personnelle du copilote.
    // Injectés en repos TypeORM directs, comme le reste de ce service (règle
    // #7 — module autonome, aucune dépendance vers `ChatMessagesService` ni
    // `MemoryService`).
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessages: Repository<ChatMessageEntity>,
    @InjectRepository(ConversationSummaryEntity)
    private readonly conversationSummaries: Repository<ConversationSummaryEntity>,
    @InjectRepository(MemoryPinnedFactEntity)
    private readonly memoryFacts: Repository<MemoryPinnedFactEntity>,
    @InjectRepository(UserPreferenceEntity)
    private readonly preferences: Repository<UserPreferenceEntity>,
    // #1939 — décision Louis 13/09 : SEULE exception hard-delete de ce
    // service. `laura_interventions` est une trace comportementale
    // strictement PERSONNELLE (jamais partagée à l'équipe, contrairement aux
    // fils et aux faits épinglés ci-dessus) — même geste que
    // `MemoryService.forgetMine('refusals')` (`memory.service.ts:620-625`),
    // qui la traite déjà comme une mémoire qu'on OUBLIE, pas qu'on scrube.
    @InjectRepository(LauraInterventionEntity)
    private readonly lauraInterventions: Repository<LauraInterventionEntity>,
    // #1919 — les retours de la personne sur les réponses de Laura : même
    // nature que `laura_interventions` (personnels, jamais partagés), même geste.
    @InjectRepository(ChatReplyFeedbackEntity)
    private readonly replyFeedback: Repository<ChatReplyFeedbackEntity>,
    // #1939 × #1911.1 — l'auteur d'un titre de fil (`set_by`), anonymisé comme
    // celui d'un message. Seul constructeur positionnel : sa spec, mise à jour.
    @InjectRepository(ChatThreadTitleEntity)
    private readonly threadTitles: Repository<ChatThreadTitleEntity>,
    @InjectRepository(UserSessionEntity)
    private readonly sessions: Repository<UserSessionEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly stripeService: StripeService,
    // #1916.23 / Q1 — l'historique des gestes sur la mémoire, dont l'auteur est
    // retiré à l'effacement. Injecté après Stripe : un paramètre inséré au milieu
    // décalerait la construction positionnelle de la spec sans que rien ne jette.
    @InjectRepository(MemoryFactEventEntity)
    private readonly memoryFactEvents: Repository<MemoryFactEventEntity>,
    // #1938.4 — décision Louis 13/09 batch 13 : le numéro saisi pour les
    // alertes SMS. Ajouté APRÈS le journal des gestes (#1916.23) à la refusion
    // du 13/09 : la spec construit ce service par position.
    @InjectRepository(NotificationSmsChannelEntity)
    private readonly smsChannels: Repository<NotificationSmsChannelEntity>,
    // #1939.9 — APRÈS le numéro SMS (#1938.4) : l'effacement immédiat
    // des enregistrements vocaux, reçu
    // comme un PORT (`voice-message-eraser.ts`) que le module branche sur le
    // stockage. Ce service ne connaît ni le stockage, ni un chemin, ni un
    // domaine — il ne peut rien effacer d'autre que la voix de la personne.
    @Inject(VOICE_MESSAGE_ERASER) private readonly eraseVoiceMessages: VoiceMessageEraser,
    // #2439.13 — les conservations légales en cours, lues (jamais écrites)
    // pour épargner l'attribution des messages qu'elles couvrent. Repo direct
    // plutôt qu'une dépendance vers `ChatConversationsService` : ce module
    // reste AUTONOME (règle n°7), comme le reste de ce service.
    @InjectRepository(ChatConversationEntity)
    private readonly chatConversations: Repository<ChatConversationEntity>,
    // #2876 (#2433.4) — APRÈS le port d'effacement vocal, obligatoire comme
    // lui : l'effacement immédiat des images de chat d'un compte supprimé,
    // reçu comme un PORT (`image-attachment-eraser.ts`) pour la même raison.
    @Inject(IMAGE_ATTACHMENT_ERASER) private readonly eraseImageAttachments: ImageAttachmentEraser,
    // #1916.24 — les traces des éléments de mémoire envoyés à Laura pour les
    // réponses de cette personne. Optionnel, donc TOUJOURS le dernier (après le
    // port d'effacement vocal, obligatoire — refusion du 13/09) : les suites qui
    // construisent ce service par position gardent leur ordre.
    @Optional()
    @InjectRepository(ChatReplyMemoryUseEntity)
    private readonly replyMemoryUses?: Repository<ChatReplyMemoryUseEntity>,
  ) {}

  /**
   * Anonymise + close the account. Refuses unless `confirmation` is exactly
   * {@link DELETION_CONFIRMATION} (defence in depth — the DTO enforces the same
   * literal). Order: cancel billing first (stop the money), then scrub PII, then
   * revoke every device.
   *
   * @throws BadRequestException when the confirmation phrase is wrong/missing.
   */
  async deleteAccount(userId: string, confirmation: string): Promise<DeletionSummary> {
    if (confirmation !== DELETION_CONFIRMATION) {
      throw new BadRequestException(`Confirmation requise : tapez « ${DELETION_CONFIRMATION} » pour supprimer.`)
    }

    // ⚠️ Une salle de DÉMONSTRATION n'est le compte de personne.
    //
    // Trouvé en production le 28/08 : le pied de la barre latérale d'une salle
    // publique affichait « [supprimé] [supprimé] ». Un visiteur du lien de
    // démonstration n'est pas propriétaire de « son » compte — il est connecté
    // EN TANT QUE la salle, qui est partagée avec tous les prospects suivants.
    // « Supprimer mon compte » y détruit donc l'identité de la salle pour tout
    // le monde, définitivement, et sans qu'aucune donnée personnelle du
    // visiteur soit en jeu : il n'y en a aucune.
    //
    // Le droit à l'effacement n'est pas atteint — un visiteur de démonstration
    // n'a rien confié. La garde ferme un chemin d'ABUS, pas un droit.
    //
    // Lue depuis `workspaces` et non depuis `WorkspaceContextService` : ce
    // module est AUTONOME (règle n°7 du dépôt), il ne dépend que de dépôts
    // TypeORM partagés. Le retirer ne doit casser personne.
    const demoRoom = await this.workspaces.findOne({ where: { owner_user_id: userId, is_demo: true } })
    if (demoRoom) {
      throw new BadRequestException(
        'Cet espace est une salle de démonstration partagée : il ne porte aucune donnée personnelle à effacer.',
      )
    }

    const subscriptionCanceled = await this.cancelActiveSubscription(userId)
    const profileAnonymized = await this.anonymizeProfile(userId)
    const contacts = await this.anonymizeContacts(userId)
    const consultants = await this.anonymizeConsultants(userId)
    const ragDocuments = await this.scrubRagDocuments(userId)
    const activities = await this.scrubActivities(userId)
    // #1939 — les échanges avec Laura et la mémoire personnelle du copilote.
    // #1939.9 — BRANCHÉ le 12/09 (lot vocal) : les enregistrements audio partent
    // TOUT DE SUITE, sans attendre leurs 30 jours, et AVANT l'anonymisation des
    // messages qui les portent. Le texte d'un fil partagé reste, sans l'auteur ;
    // la voix n'a aucun lecteur à préserver. Seul le domaine `chat_voice_message`
    // est atteignable — jamais un justificatif ni une pièce d'affaire.
    const voice = await this.eraseVoiceMessages(userId, localDayKey(new Date()))
    // #2876 (#2433.4) — même geste, même moment : une image jointe au chat
    // peut porter la donnée personnelle d'un tiers, jamais une pièce de
    // l'entreprise. Seul le domaine `chat_image_attachment` est atteignable.
    const imageAttachments = await this.eraseImageAttachments(userId, localDayKey(new Date()))
    // #2433.4 / #2433.12 (lot W8) — le texte LU dans ces captures (zones citées, cellules d'un
    // tableau) part avec l'image, AVANT que le lien d'auteur ne disparaisse (c'est le critère).
    await this.scrubImageVision(userId)
    const { anonymized: chatMessages, keptForLegalHold: chatMessagesKeptForLegalHold } =
      await this.anonymizeChatMessages(userId)
    const conversationSummaries = await this.scrubConversationSummaries(userId)
    // #1939 × #1918.1 — les éléments « Toi uniquement » SUPPRIMÉS, AVANT
    // d'anonymiser : retirer d'abord l'auteur ferait perdre le seul critère qui
    // les désigne, et ils survivraient orphelins, texte compris.
    const personalMemoryFacts = await this.deletePersonalMemoryFacts(userId)
    const memoryFacts = await this.anonymizeMemoryFacts(userId)
    const memoryFactConfirmations = await this.anonymizeMemoryFactConfirmations(userId)
    const memoryFactEvents = await this.anonymizeMemoryFactEvents(userId)
    const threadTitles = await this.anonymizeThreadTitles(userId)
    const preferencesCleared = await this.clearPreferences(userId)
    // #1939 — décision Louis 13/09 : mémoire personnelle, effacée pour de bon,
    // même geste que `MemoryService.forgetMine('refusals')`. Voir
    // `deleteLauraInterventions` pour pourquoi c'est la SEULE exception
    // hard-delete de cette méthode.
    const lauraInterventions = await this.deleteLauraInterventions(userId)
    // #1916.24 — mêmes raisons : une trace personnelle, effacée pour de bon.
    const replyMemoryUses = await this.deleteReplyMemoryUses(userId)
    // #1919 — même geste pour les retours sur les réponses de Laura.
    const replyFeedback = await this.deleteReplyFeedback(userId)
    // #1938.4 — décision Louis 13/09 batch 13 : le numéro de mobile des alertes
    // SMS part avec le compte, pour de bon.
    const smsChannel = await this.deleteSmsChannel(userId)
    const sessionsRevoked = await this.revokeAllSessions(userId)

    this.logger.log(
      `Account anonymised for user ${userId} (contacts=${contacts}, chatMessages=${chatMessages}, chatMessagesKeptForLegalHold=${chatMessagesKeptForLegalHold}, voiceMessages=${voice.erased}+${voice.deferred} deferred, imageAttachments=${imageAttachments.erased}+${imageAttachments.deferred} deferred, sessions=${sessionsRevoked})`,
    )

    return {
      anonymized: {
        profile: profileAnonymized,
        contacts,
        consultants,
        ragDocuments,
        activities,
        chatMessages,
        chatMessagesKeptForLegalHold,
        conversationSummaries,
        memoryFacts,
        memoryFactConfirmations,
        memoryFactEvents,
        threadTitles,
        preferencesCleared,
      },
      deleted: {
        lauraInterventions,
        personalMemoryFacts,
        replyMemoryUses,
        replyFeedback,
        smsChannel,
      },
      voiceMessages: { erased: voice.erased, deferredToNextPurge: voice.deferred },
      imageAttachments: { erased: imageAttachments.erased, deferredToNextPurge: imageAttachments.deferred },
      sessionsRevoked,
      subscriptionCanceled,
      retained: [
        'subscriptions (ligne de facturation — liens Stripe, obligations comptables)',
        'credit_ledger (journal des crédits — audit pseudonymisé)',
        'user_actions (journal des actions — audit pseudonymisé)',
        'accounts (données d’entreprises, non nominatives)',
        // #1919.7 — une correction de donnée portée au DOSSIER d'un compte
        // (« Donnée fausse » › « aussi dans le dossier ») est une donnée de
        // l'ESPACE, pas de la personne : elle corrige ce que toute l'équipe lit
        // du compte. Elle reste — seule sa trace personnelle
        // (`chat_reply_feedback`) part avec le compte.
        'account_feedback (corrections portées au dossier d’un compte — donnée de l’espace)',
        'factures Stripe (conservation légale ~10 ans)',
        // #1939 — PAS de la mémoire personnelle : ce sont des pièces de
        // l'ENTREPRISE avec obligations de conservation légale (Code de
        // commerce, art. L123-22 / L110-4). Le troisième domaine,
        // `chat_voice_message`, n'est PAS conservé : il est effacé plus haut
        // (`voiceMessages`), et c'est `storage-voice.service.spec.ts` qui
        // prouve que cet effacement ne peut pas atteindre ces deux-là.
        // #2814 — les pièces jointes d'une facture préparée : pièces comptables.
        'storage_objects — expense_receipt, need_document, invoice_attachment (justificatifs, documents de besoin et pièces de facture, obligations de conservation légale)',
      ],
    }
  }

  /**
   * A deterministic, non-reversible replacement for the real email. Keyed on the
   * user id so it stays UNIQUE (the `profiles.email` unique index survives) while
   * carrying no personal data and never colliding with a real address (`.invalid`
   * is reserved by RFC 6761).
   */
  private anonymizedEmail(userId: string): string {
    const digest = createHash('sha256').update(userId).digest('hex').slice(0, 32)
    return `deleted-${digest}@anonymized.invalid`
  }

  /** Overwrite the identity row's PII and stamp `anonymized_at`. */
  private async anonymizeProfile(userId: string): Promise<boolean> {
    const res = await this.profiles.update(
      { user_id: userId },
      {
        email: this.anonymizedEmail(userId),
        first_name: REDACTED,
        last_name: REDACTED,
        avatar_url: null,
        profile_context: null,
        anonymized_at: new Date(),
      },
    )
    return (res.affected ?? 0) > 0
  }

  /** Scrub every prospect contact the user collected (third-party personal data). */
  private async anonymizeContacts(userId: string): Promise<number> {
    const res = await this.contacts.update(
      { user_id: userId },
      {
        full_name: REDACTED,
        email: null,
        phone: null,
        linkedin_url: null,
        profile_summary: null,
        why_contact: null,
        note: null,
        email_message: null,
        linkedin_message: null,
        phone_script: null,
        followup_message: null,
        raw_data: null,
        // #2297.51 — la rétention ARCHIVE, l'effacement SUPPRIME : l'archive
        // des coordonnées enrichies part ici, comme le profil fournisseur
        // (numéros, e-mails personnels, parcours) et la photo, que ce chemin
        // laissait derrière lui.
        enrichment_archive: null,
        apollo_enrichment: null,
        photo_url: null,
        anonymized_at: new Date(),
      },
    )
    return res.affected ?? 0
  }

  /**
   * Scrub every talent of the vivier (third-party personal data).
   *
   * Anonymised in place rather than deleted, for the same reason as contacts:
   * a talent row is referenced by missions and submissions that carry no
   * personal data of their own, and hard-deleting it would silently drop a
   * mission's staffing. `cv_text` is cleared outright — it is the single
   * largest block of personal data the product stores.
   */
  private async anonymizeConsultants(userId: string): Promise<number> {
    const res = await this.consultants.update(
      { user_id: userId },
      {
        full_name: REDACTED,
        title: null,
        references: [],
        wants: null,
        notes: null,
        cv_text: null,
        last_contact_at: null,
      },
    )
    return res.affected ?? 0
  }

  /** Clear the free-text content of the user's uploaded knowledge documents.
   *
   *  Le titre et le contenu sont les seuls champs libres de la table : c'est là
   *  que vit le texte déposé par l'utilisateur. (Cette mise à jour écrivait aussi
   *  `metadata`, une colonne DÉCLARÉE par l'entité mais absente de la base —
   *  l'ordre entier échouait donc, et l'effacement s'arrêtait ici, avant la
   *  révocation des sessions. Voir `database/entity-schema-parity.db.spec.ts`.) */
  private async scrubRagDocuments(userId: string): Promise<number> {
    const res = await this.ragDocuments.update({ user_id: userId }, { title: null, content: null })
    return res.affected ?? 0
  }

  /**
   * Efface le CONTENU personnel des activités de l'utilisateur (finding #7) :
   * le corps intégral des e-mails/appels et l'objet. On garde la ligne et ses
   * métadonnées non nominatives (canal, direction, date, compte) — « on archive,
   * on ne supprime pas » : le fait qu'une interaction a eu lieu reste, son
   * contenu personnel part.
   */
  private async scrubActivities(userId: string): Promise<number> {
    const res = await this.activities.update({ user_id: userId }, { body: null, subject: null, body_truncated: false })
    return res.affected ?? 0
  }

  /**
   * #1939 (RGPD art. 17) — anonymise les échanges avec Laura de cette
   * personne : retire le LIEN vers son identité, JAMAIS le texte.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI PAS COMME LES ACTIVITÉS (scruber le contenu)
   * ─────────────────────────────────────────────────────────────────────────
   * `scrubActivities` vide `body`/`subject` parce qu'une boîte mail est
   * PERSONNELLE (D58) : personne d'autre ne la lit. Une CONVERSATION NOMMÉE de
   * `chat_messages` est l'inverse — c'est un fil PARTAGÉ DE L'ESPACE :
   * `ChatMessagesService` (lecture `listThread`/`listHistory`) la filtre par
   * `workspace_id`. Vider `content` couperait donc l'historique de TOUS les
   * collègues qui lisent encore ce fil, pas seulement les traces de la
   * personne qui part. Ce que le droit à l'effacement retire ici, c'est le
   * lien vers LA PERSONNE ; le texte reste lisible par l'équipe.
   *
   * ⚠️ #2703 (22/09/2026) — le fil PAR DÉFAUT, lui, n'est plus partagé : il est
   * lu par `workspace_id` ET `user_id`. Ce geste ne change pas pour autant —
   * il reste UNIFORME (voir juste en dessous) : retirer le lien suffit, et une
   * ligne sans auteur dans un fil par défaut n'est simplement plus rattachée à
   * personne. Elle n'est ni vidée ni supprimée : « on archive, on ne supprime
   * pas », et c'est le brouillon de quelqu'un qui a demandé son effacement.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI PAS DE CAS SPÉCIAL POUR UN FIL QUE PERSONNE D'AUTRE N'A LU
   * ─────────────────────────────────────────────────────────────────────────
   * Ni `scrubActivities` ni `scrubRagDocuments` ne vérifient qui d'autre a lu
   * ou écrit avant de scruber — c'est un geste UNIFORME, borné par `user_id`
   * seul. Même règle ici plutôt qu'une distinction nouvelle : un fil à un seul
   * membre suit exactement le même geste qu'un fil à dix.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * #1939.9 — LE LOT VOCAL EST BRANCHÉ (12/09/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * Le point d'extension écrit ici a été rempli : `deleteAccount` appelle le
   * port `VOICE_MESSAGE_ERASER` (branché par `privacy.module.ts` sur
   * `StorageService.eraseVoiceMessagesUploadedBy`) JUSTE AVANT cette méthode.
   * Elle efface IMMÉDIATEMENT (octets puis lignes) les objets
   * `domain = 'chat_voice_message' AND uploaded_by = userId` — domaine écrit en
   * dur dans chaque requête, donc `expense_receipt` et `need_document` (pièces
   * de l'ENTREPRISE, obligations de conservation légale) sont inatteignables.
   * `chat_messages.voice_object_id` passe à NULL par `ON DELETE SET NULL` :
   * le texte reste, sans auteur ni voix.
   */
  /**
   * #2433.4 / #2433.12 (lot W8) — retire `regions` et `objects` des images jointes aux
   * messages de cette personne : le NOM du fichier reste (comme le texte du fil), le
   * contenu lu dans l'image ne survit pas à l'image effacée.
   */
  private async scrubImageVision(userId: string): Promise<void> {
    await this.chatMessages.query(
      `UPDATE chat_messages
         SET image_attachments = (
           SELECT jsonb_agg(elem - 'regions' - 'objects') FROM jsonb_array_elements(image_attachments) elem
         )
       WHERE user_id = $1 AND image_attachments IS NOT NULL`,
      [userId],
    )
  }

  /**
   * #2439.13 — épargne l'attribution des messages d'une conversation sous
   * CONSERVATION LÉGALE. La conservation ne DÉPLACE rien : elle protège
   * exactement les messages de la conversation tenue, jamais le reste du
   * fil de la personne — un fil par défaut (`conversation_id IS NULL`) n'a
   * jamais de ligne `chat_conversations` et n'est donc jamais couvert.
   *
   * ⚠️ `Not(In(ids))` de TypeORM exclurait AUSSI, par la logique à trois
   * valeurs de SQL, toute ligne `conversation_id IS NULL` — c'est-à-dire la
   * majorité des messages, ceux du fil par défaut. D'où les deux clauses
   * séparées plutôt qu'une négation unique.
   */
  private async anonymizeChatMessages(userId: string): Promise<{ anonymized: number; keptForLegalHold: number }> {
    const held = await this.chatConversations.find({
      where: { legal_hold_at: Not(IsNull()) },
      select: ['conversation_id'],
    })
    const heldConversationIds = held.map(row => row.conversation_id)

    if (heldConversationIds.length === 0) {
      const res = await this.chatMessages.update({ user_id: userId }, { user_id: null })
      return { anonymized: res.affected ?? 0, keptForLegalHold: 0 }
    }

    const keptForLegalHold = await this.chatMessages.count({
      where: { user_id: userId, conversation_id: In(heldConversationIds) },
    })
    const res = await this.chatMessages.update(
      [
        { user_id: userId, conversation_id: IsNull() },
        { user_id: userId, conversation_id: Not(In(heldConversationIds)) },
      ],
      { user_id: null },
    )
    return { anonymized: res.affected ?? 0, keptForLegalHold }
  }

  /**
   * #1939 — vide le résumé roulant que Laura garde de CETTE personne.
   *
   * Portée strictement PERSONNELLE : `conversation_summaries.user_id` n'est
   * jamais partagé (`ConversationSummaryEntity`, `1790700047318-
   * ConversationSummaryPerMember` a fermé l'ancien partage d'espace). Il n'y a
   * donc, contrairement au fil de discussion, aucun lecteur tiers à préserver
   * — on efface le CONTENU, comme `scrubRagDocuments`/`scrubActivities`,
   * plutôt que de retirer un lien d'identité sans objet. `summary` est
   * `NOT NULL DEFAULT ''` : la vider la ramène à son état par défaut, ce que
   * `getConversationSummary`/`ledgerConversations` lisent déjà comme « rien
   * ici ».
   */
  private async scrubConversationSummaries(userId: string): Promise<number> {
    const res = await this.conversationSummaries.update({ user_id: userId }, { summary: '' })
    return res.affected ?? 0
  }

  /**
   * #1939 (RGPD art. 17) — anonymise les faits épinglés par cette personne :
   * retire le LIEN vers son identité, JAMAIS le texte.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CORRIGÉ LE 12/09 (relecture orchestrateur sur 548e55051) — CE QUE LA
   * PREMIÈRE VERSION FAISAIT MAL
   * ─────────────────────────────────────────────────────────────────────────
   * La version d'origine rédigeait `fact = REDACTED`, suivant le même geste
   * que `anonymizeContacts`. C'était le mauvais précédent : `contacts` est une
   * donnée que SEUL son propriétaire consulte, alors que
   * `memory_pinned_facts` est une mémoire PARTAGÉE de l'espace — un fait
   * épinglé est un geste DÉLIBÉRÉ de partage vers l'équipe
   * (`MemoryService`, doc de classe). `listFacts` (l'UNIQUE lecture : la
   * carte « Mémoire » ET `ChatContextService.loadMemory` → le prompt du
   * modèle) filtre par `workspace_id` SEUL, jamais par `user_id`
   * (`memory.service.ts:365-375`) : rédiger le texte aurait donc affiché
   * « [supprimé] » à un collègue et l'aurait envoyé au modèle comme un fait
   * réel. Le bon précédent était `anonymizeChatMessages` : un fil partagé
   * garde son texte, seul l'auteur part. Preuve du mécanisme de lecture :
   * `memory.service.spec.ts` (« n'importe quel contenu … »).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * #1939 × #1918.1 — LA PORTÉE « TOI UNIQUEMENT » EST CÂBLÉE (13/09)
   * ─────────────────────────────────────────────────────────────────────────
   * Depuis la migration `1792800070000-MemoryPinnedFactScope`, un élément peut
   * être PERSONNEL (`scope = 'user'`, visible de son seul auteur). Il n'a, par
   * construction, aucun autre lecteur à préserver : il est SUPPRIMÉ par
   * {@link deletePersonalMemoryFacts}, appelée JUSTE AVANT cette méthode — si
   * bien que ce qui reste à anonymiser ici est l'élément PARTAGÉ : l'auteur
   * part, le texte reste.
   */
  private async anonymizeMemoryFacts(userId: string): Promise<number> {
    const res = await this.memoryFacts.update({ user_id: userId }, { user_id: null })
    return res.affected ?? 0
  }

  /**
   * #1939 × #1918.1 (RGPD art. 17, décision 12/09 batch 6) — SUPPRIME les
   * éléments de mémoire « Toi uniquement » de ce compte.
   *
   * `MemoryService.listFacts` ne rend un élément `scope = 'user'` qu'à son auteur
   * (`scope = 'workspace' OR user_id = :viewer`). Anonymisé comme un élément
   * partagé, il resterait en base texte intact, sans auteur, visible de PERSONNE
   * et jamais effacé. Même geste que `MemoryService.forgetMine('facts')` et que
   * {@link deleteLauraInterventions} : une mémoire personnelle sans autre lecteur
   * s'oublie, elle ne s'anonymise pas.
   *
   * ⚠️ Le critère porte les DEUX bornes : le compte effacé ET la portée privée.
   * Sans `scope`, cette suppression emporterait les règles que la personne a
   * PARTAGÉES avec son ESN ; sans `user_id`, les éléments privés de ses
   * collègues. L'historique de chaque élément supprimé part avec lui
   * (`memory_fact_events.fact_id ON DELETE CASCADE`).
   *
   * Compte AVANT de supprimer, comme {@link deleteLauraInterventions} : un pilote
   * peut rendre une forme illisible sur un DELETE.
   */
  private async deletePersonalMemoryFacts(userId: string): Promise<number> {
    const personal = { user_id: userId, scope: 'user' as const }
    const count = await this.memoryFacts.count({ where: personal })
    if (count > 0) await this.memoryFacts.delete(personal)
    return count
  }

  /**
   * Q1 (13/09) — retire le CONFIRMATEUR des notes de Laura que cette personne a
   * confirmées. La confirmation reste (`confirmed_at`) : une personne a bien relu
   * la note, et l'écran dit « confirmée » sans prénom. Borné au seul compte effacé.
   */
  private async anonymizeMemoryFactConfirmations(userId: string): Promise<number> {
    const res = await this.memoryFacts.update({ confirmed_by: userId }, { confirmed_by: null })
    return res.affected ?? 0
  }

  /**
   * #1916.23 — retire l'AUTEUR des gestes de l'historique de la mémoire faits par
   * cette personne. Le geste reste (l'histoire d'un élément partagé appartient à
   * l'espace) ; le compte n'étant pas supprimé de `auth.users`, le `ON DELETE SET
   * NULL` de la colonne ne jouerait jamais seul.
   */
  private async anonymizeMemoryFactEvents(userId: string): Promise<number> {
    const res = await this.memoryFactEvents.update({ actor_user_id: userId }, { actor_user_id: null })
    return res.affected ?? 0
  }

  /**
   * #1939 × #1911.1 (RGPD art. 17) — retire l'AUTEUR des titres de fil posés
   * par cette personne (`set_by` : saisi à la main, ou rédigé par Laura au tour
   * de cette personne). Jamais le TITRE : il nomme un fil PARTAGÉ de l'espace
   * (`ChatThreadTitlesService.withStoredTitles` lit par `workspace_id`), exactement
   * comme `anonymizeChatMessages` garde le texte d'un message.
   *
   * Trouvé en revue d'intégration du lot fils (13/09) : les titres et
   * l'effacement ont été écrits en parallèle, et `set_by` n'était touché nulle
   * part. Migration `1792800044000-ChatThreadTitleSetByNullable` posée avant.
   */
  private async anonymizeThreadTitles(userId: string): Promise<number> {
    const res = await this.threadTitles.update({ set_by: userId }, { set_by: null })
    return res.affected ?? 0
  }

  /**
   * #1939 — vide le sac de préférences personnelles de cette personne.
   *
   * `user_preferences` est une table strictement personnelle (`user_id`
   * UNIQUE, une ligne par personne, jamais lue par un collègue) : la vider
   * ramène la ligne à son état par défaut (`{}`), sans avoir besoin de
   * supprimer la ligne elle-même.
   */
  private async clearPreferences(userId: string): Promise<boolean> {
    const res = await this.preferences.update({ user_id: userId }, { preferences: {} })
    return (res.affected ?? 0) > 0
  }

  /**
   * #1939 (RGPD art. 17, décision Louis 13/09) — SUPPRIME (pour de bon) les
   * traces d'intervention proactive de cette personne.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI C'EST LA SEULE EXCEPTION HARD-DELETE DE CETTE MÉTHODE
   * ─────────────────────────────────────────────────────────────────────────
   * `laura_interventions` n'est PAS de la mémoire partagée avec l'équipe,
   * contrairement à `chat_messages` (fil de l'espace) et
   * `memory_pinned_facts` (geste délibéré de partage) : `screen`/`format`/
   * `reaction` sont des données comportementales SUR cette personne, lues par
   * elle seule (`MemoryService.ledgerRefusals`, scope `user_id`). Rien ici
   * n'a de lecteur à préserver, donc rien ne justifie l'anonymisation en
   * place plutôt que la suppression.
   *
   * Même geste que `MemoryService.forgetMine('refusals')`
   * (`memory.service.ts:620-625`), qui traite déjà cette table comme une
   * mémoire personnelle qu'on OUBLIE (delete) et non qu'on scrube — on suit
   * ce précédent plutôt que d'en inventer un nouveau.
   *
   * Compte AVANT de supprimer plutôt que de lire `affected` : même raison que
   * `forgetMine`, un pilote peut rendre une forme illisible sur un DELETE.
   */
  private async deleteLauraInterventions(userId: string): Promise<number> {
    const scope = { user_id: userId }
    const count = await this.lauraInterventions.count({ where: scope })
    await this.lauraInterventions.delete(scope)
    return count
  }

  /**
   * #1916.24 — les traces « cet élément de mémoire était dans le contexte de
   * telle réponse » posées par les questions de CETTE personne.
   *
   * Supprimées, pas anonymisées : elles ne portent aucun contenu partagé — des
   * identifiants qui disent ce que Laura avait en tête pour SES questions. Une
   * trace sans auteur n'aurait plus de lecteur légitime. Bornées par `user_id`
   * seul : un collègue garde les traces de ses propres réponses, même quand elles
   * désignent un élément que cette personne avait partagé (l'élément, lui, reste
   * dans la mémoire de l'espace).
   *
   * Compte AVANT de supprimer, comme `deleteLauraInterventions`.
   */
  private async deleteReplyMemoryUses(userId: string): Promise<number | null> {
    if (!this.replyMemoryUses) return null
    const scope = { user_id: userId }
    const count = await this.replyMemoryUses.count({ where: scope })
    await this.replyMemoryUses.delete(scope)
    return count
  }

  /**
   * #1919 — les retours de la personne sur les réponses de Laura.
   *
   * Même nature que `laura_interventions` : lus dans le SEUL prompt de leur
   * auteur (`ReplyFeedbackService.memoryFor`, bornée espace + auteur), jamais
   * par un collègue. Rien n'a de lecteur à préserver, donc supprimés, et bornés
   * au seul `user_id` — tous espaces confondus, puisque c'est la personne qui
   * part.
   *
   * La correction portée au DOSSIER (`account_feedback`) n'est pas ici : c'est
   * une donnée de l'espace — voir `retained`.
   */
  private async deleteReplyFeedback(userId: string): Promise<number> {
    const scope = { user_id: userId }
    const count = await this.replyFeedback.count({ where: scope })
    await this.replyFeedback.delete(scope)
    return count
  }

  /**
   * #1938.4 (RGPD art. 17, décision Louis 13/09 batch 13) — SUPPRIME le canal
   * SMS de cette personne : son numéro de mobile, sa vérification, son
   * consentement, ses choix, et un éventuel code en attente.
   *
   * Même geste que `deleteLauraInterventions`, pour la même raison : la ligne
   * est strictement PERSONNELLE (`user_id` seul, lue par sa propriétaire seule),
   * aucun collègue ne la lit, rien ne justifie d'écrire un numéro de
   * remplacement. Compté avant, supprimé ensuite — borné au SEUL `user_id`.
   */
  private async deleteSmsChannel(userId: string): Promise<number> {
    const scope = { user_id: userId }
    const count = await this.smsChannels.count({ where: scope })
    await this.smsChannels.delete(scope)
    return count
  }

  /** Revoke ALL of the user's devices so no active session survives the deletion. */
  private async revokeAllSessions(userId: string): Promise<number> {
    const res = await this.sessions.update({ user_id: userId }, { revoked_at: new Date() })
    return res.affected ?? 0
  }

  /**
   * Cancel the user's live Stripe subscription, if any. Best-effort: a Stripe
   * error is logged (via the Winston→Sentry transport) and swallowed so the rest
   * of the erasure still completes. Returns whether a cancel was attempted.
   */
  private async cancelActiveSubscription(userId: string): Promise<boolean> {
    const sub = await this.subscriptions.findOne({
      where: { user_id: userId },
      select: ['stripe_subscription_id'],
    })
    const subscriptionId = sub?.stripe_subscription_id
    if (!subscriptionId) return false

    try {
      await this.stripeService.cancelSubscription(subscriptionId)
      return true
    } catch (error) {
      this.logger.error(`Failed to cancel Stripe subscription ${subscriptionId} during account deletion`, {
        error,
        tags: { 'stripe.op': 'subscriptions.cancel', 'privacy.op': 'delete_account' },
      })
      return false
    }
  }
}
