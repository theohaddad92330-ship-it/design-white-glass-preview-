import { BadRequestException } from '@nestjs/common'
import { DELETION_CONFIRMATION, PrivacyDeletionService } from './privacy-deletion.service'
import type { StripeService } from '../stripe/stripe.service'
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
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const USER = 'user-abc'
const OTHER_USER = 'user-xyz'

type Ctx = {
  service: PrivacyDeletionService
  profiles: MockRepository<ProfileEntity>
  contacts: MockRepository<ContactEntity>
  consultants: MockRepository<ConsultantEntity>
  ragDocuments: MockRepository<RagDocumentEntity>
  activities: MockRepository<ActivityEntity>
  chatMessages: MockRepository<ChatMessageEntity>
  chatConversations: MockRepository<ChatConversationEntity>
  conversationSummaries: MockRepository<ConversationSummaryEntity>
  memoryFacts: MockRepository<MemoryPinnedFactEntity>
  preferences: MockRepository<UserPreferenceEntity>
  lauraInterventions: MockRepository<LauraInterventionEntity>
  replyFeedback: MockRepository<ChatReplyFeedbackEntity>
  threadTitles: MockRepository<ChatThreadTitleEntity>
  sessions: MockRepository<UserSessionEntity>
  subscriptions: MockRepository<SubscriptionEntity>
  workspaces: MockRepository<WorkspaceEntity>
  memoryFactEvents: MockRepository<MemoryFactEventEntity>
  smsChannels: MockRepository<NotificationSmsChannelEntity>
  replyMemoryUses: MockRepository<ChatReplyMemoryUseEntity>
  cancelSubscription: jest.Mock
  /** #1939 — le port `VOICE_MESSAGE_ERASER` : efface la voix d'une personne, rien d'autre. */
  eraseVoiceMessages: jest.Mock
  /** #2876 (#2433.4) — le port `IMAGE_ATTACHMENT_ERASER` : efface les images de chat d'une personne, rien d'autre. */
  eraseImageAttachments: jest.Mock
}

function makeService(): Ctx {
  const profiles = createMockRepository<ProfileEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const consultants = createMockRepository<ConsultantEntity>()
  const ragDocuments = createMockRepository<RagDocumentEntity>()
  const activities = createMockRepository<ActivityEntity>()
  const chatMessages = createMockRepository<ChatMessageEntity>()
  const chatConversations = createMockRepository<ChatConversationEntity>()
  const conversationSummaries = createMockRepository<ConversationSummaryEntity>()
  const memoryFacts = createMockRepository<MemoryPinnedFactEntity>()
  const preferences = createMockRepository<UserPreferenceEntity>()
  const lauraInterventions = createMockRepository<LauraInterventionEntity>()
  const replyFeedback = createMockRepository<ChatReplyFeedbackEntity>()
  const threadTitles = createMockRepository<ChatThreadTitleEntity>()
  const sessions = createMockRepository<UserSessionEntity>()
  const subscriptions = createMockRepository<SubscriptionEntity>()
  const workspaces = createMockRepository<WorkspaceEntity>()
  const smsChannels = createMockRepository<NotificationSmsChannelEntity>()
  workspaces.findOne.mockResolvedValue(null)
  const memoryFactEvents = createMockRepository<MemoryFactEventEntity>()
  const replyMemoryUses = createMockRepository<ChatReplyMemoryUseEntity>()
  const cancelSubscription = jest.fn().mockResolvedValue({ id: 'sub_1', status: 'canceled' })
  const stripe = { cancelSubscription } as unknown as StripeService
  const eraseVoiceMessages = jest.fn().mockResolvedValue({ erased: 0, deferred: 0 })
  const eraseImageAttachments = jest.fn().mockResolvedValue({ erased: 0, deferred: 0 })
  const service = new PrivacyDeletionService(
    profiles as never,
    contacts as never,
    consultants as never,
    ragDocuments as never,
    activities as never,
    chatMessages as never,
    conversationSummaries as never,
    memoryFacts as never,
    preferences as never,
    lauraInterventions as never,
    replyFeedback as never,
    threadTitles as never,
    sessions as never,
    subscriptions as never,
    workspaces as never,
    stripe,
    // #1916.23 / Q1 — le journal des gestes sur la mémoire : obligatoire, après Stripe.
    memoryFactEvents as never,
    // #1938.4 — le canal SMS, obligatoire, après le journal des gestes.
    smsChannels as never,
    // #1939.9 — le port d'effacement vocal, obligatoire.
    eraseVoiceMessages,
    // #2439.13 — les conservations légales en cours, obligatoire.
    chatConversations as never,
    // #2876 (#2433.4) — le port d'effacement des images de chat, obligatoire.
    eraseImageAttachments,
    // #1916.24 — optionnel, donc TOUJOURS le dernier.
    replyMemoryUses as never,
  )
  return {
    service,
    profiles,
    contacts,
    consultants,
    ragDocuments,
    activities,
    chatMessages,
    chatConversations,
    conversationSummaries,
    memoryFacts,
    preferences,
    lauraInterventions,
    eraseImageAttachments,
    replyFeedback,
    threadTitles,
    sessions,
    subscriptions,
    workspaces,
    memoryFactEvents,
    smsChannels,
    replyMemoryUses,
    cancelSubscription,
    eraseVoiceMessages,
  }
}

type FactRow = {
  id: string
  user_id: string | null
  scope: 'user' | 'workspace'
  fact: string
  confirmed_by: string | null
}
type EventRow = { id: string; fact_id: string; actor_user_id: string | null }

/**
 * Une table qui APPLIQUE les critères qu'on lui passe — égalité sur chaque clé,
 * et un critère VIDE lève plutôt que de tout toucher. Une garde écrite contre un
 * dépôt factice qui ignorerait ses critères serait verte par hasard.
 */
function applyingTable<Row extends { id: string }>(rows: Row[]) {
  const matches = (row: Row, criteria: Record<string, unknown>) => {
    const entries = Object.entries(criteria)
    if (entries.length === 0) throw new Error('critère vide — écriture non bornée')
    return entries.every(([column, expected]) => (row as Record<string, unknown>)[column] === expected)
  }
  return {
    rows,
    count: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where)).length,
    ),
    update: jest.fn(async (criteria: Record<string, unknown>, patch: Partial<Row>) => {
      const hit = rows.filter(row => matches(row, criteria))
      for (const row of hit) Object.assign(row, patch)
      return { affected: hit.length }
    }),
    delete: jest.fn(async (criteria: Record<string, unknown>) => {
      const hit = new Set(rows.filter(row => matches(row, criteria)))
      rows.splice(0, rows.length, ...rows.filter(row => !hit.has(row)))
      return { affected: hit.size }
    }),
  }
}

describe('PrivacyDeletionService', () => {
  describe('salle de démonstration', () => {
    /**
     * Trouvé en production le 28/08 : le pied de la barre latérale d'une salle
     * de démonstration affichait « [supprimé] [supprimé] ».
     *
     * Un visiteur du lien public N'EST PAS propriétaire de son compte — il est
     * connecté EN TANT QUE la salle, partagée avec tous les prospects suivants.
     * « Supprimer mon compte » y détruit donc l'identité de la salle pour tout
     * le monde, définitivement. Ce n'est pas le droit à l'effacement : il n'y a
     * aucune donnée personnelle du visiteur à effacer.
     */
    it('refuse la suppression quand le compte est une salle de démonstration', async () => {
      const ctx = makeService()
      ctx.workspaces.findOne.mockResolvedValue({ id: 'ws-demo', is_demo: true } as never)

      await expect(ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)).rejects.toBeInstanceOf(BadRequestException)

      // Rien n'a été écrit : la garde passe AVANT toute mutation, et avant
      // l'annulation de l'abonnement.
      expect(ctx.profiles.update).not.toHaveBeenCalled()
      expect(ctx.contacts.update).not.toHaveBeenCalled()
      expect(ctx.sessions.update).not.toHaveBeenCalled()
      expect(ctx.chatMessages.update).not.toHaveBeenCalled()
      expect(ctx.conversationSummaries.update).not.toHaveBeenCalled()
      expect(ctx.memoryFacts.update).not.toHaveBeenCalled()
      expect(ctx.memoryFacts.delete).not.toHaveBeenCalled()
      expect(ctx.preferences.update).not.toHaveBeenCalled()
      expect(ctx.lauraInterventions.delete).not.toHaveBeenCalled()
      expect(ctx.threadTitles.update).not.toHaveBeenCalled()
      expect(ctx.cancelSubscription).not.toHaveBeenCalled()
      // #1939 — aucun enregistrement n'est effacé non plus : la garde passe avant.
      expect(ctx.eraseVoiceMessages).not.toHaveBeenCalled()
    })

    it('laisse passer un compte normal — la garde ne ferme que la démonstration', async () => {
      const ctx = makeService()
      ctx.workspaces.findOne.mockResolvedValue(null)

      await expect(ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)).resolves.toBeDefined()
      expect(ctx.profiles.update).toHaveBeenCalled()
    })
  })

  describe('confirmation guard', () => {
    it('refuses deletion without the exact confirmation phrase', async () => {
      const ctx = makeService()
      await expect(ctx.service.deleteAccount(USER, 'oops')).rejects.toBeInstanceOf(BadRequestException)
      await expect(ctx.service.deleteAccount(USER, '')).rejects.toBeInstanceOf(BadRequestException)
      // Nothing was written — the guard runs before any mutation.
      expect(ctx.profiles.update).not.toHaveBeenCalled()
      expect(ctx.contacts.update).not.toHaveBeenCalled()
      expect(ctx.sessions.update).not.toHaveBeenCalled()
      expect(ctx.cancelSubscription).not.toHaveBeenCalled()
    })

    it('proceeds when the confirmation is exactly SUPPRIMER', async () => {
      const ctx = makeService()
      await expect(ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)).resolves.toBeDefined()
      expect(ctx.profiles.update).toHaveBeenCalled()
    })
  })

  describe('anonymisation', () => {
    it('scrubs the profile PII (hashed email, [supprimé] name, anonymized_at)', async () => {
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.profiles.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.first_name).toBe('[supprimé]')
      expect(patch.last_name).toBe('[supprimé]')
      expect(patch.avatar_url).toBeNull()
      expect(patch.email).toMatch(/^deleted-[0-9a-f]{32}@anonymized\.invalid$/)
      expect(patch.email).not.toContain('@corp')
      expect(patch.anonymized_at).toBeInstanceOf(Date)
    })

    it('scrubs prospect contacts PII and stamps anonymized_at', async () => {
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.contacts.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.full_name).toBe('[supprimé]')
      expect(patch.email).toBeNull()
      expect(patch.phone).toBeNull()
      expect(patch.linkedin_url).toBeNull()
      expect(patch.raw_data).toBeNull()
      expect(patch.anonymized_at).toBeInstanceOf(Date)
    })

    it('#2297.51 — l’effacement SUPPRIME réellement ce que la rétention n’avait qu’archivé, et le profil enrichi', async () => {
      // La rétention archive (on ne supprime pas) ; la demande d'effacement,
      // elle, supprime : une archive qui survivrait à l'effacement n'en serait
      // pas un. Même chose pour le profil fournisseur (numéros, e-mails
      // personnels, parcours) et la photo, que ce chemin laissait derrière.
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [, patch] = ctx.contacts.update.mock.calls[0]
      expect(patch).toMatchObject({ enrichment_archive: null, apollo_enrichment: null, photo_url: null })
    })

    it('scrubs the VIVIER too — un CV en clair est la donnée la plus personnelle du schéma', async () => {
      // Absent jusqu'au 20/08 alors que l'arbitrage #7 du 16/08 promettait le
      // branchement : un effacement qui laisse le CV derrière n'est pas un
      // effacement. Anonymisé en place et non supprimé — une fiche talent est
      // référencée par des missions qui ne portent, elles, aucune donnée
      // personnelle, et l'effacer ferait perdre le staffing en silence.
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.consultants.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.full_name).toBe('[supprimé]')
      expect(patch.cv_text).toBeNull()
      expect(patch.notes).toBeNull()
      expect(patch.last_contact_at).toBeNull()
    })

    it('clears the free-text content of uploaded documents', async () => {
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.ragDocuments.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.content).toBeNull()
      expect(patch.title).toBeNull()
    })

    it('SÉCURITÉ #7 — efface le corps et l’objet des activités (les messages), garde les métadonnées', async () => {
      const ctx = makeService()
      ctx.activities.update.mockResolvedValue({ affected: 3 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.activities.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.body).toBeNull()
      expect(patch.subject).toBeNull()
      // Les métadonnées non nominatives NE sont pas touchées.
      expect(patch).not.toHaveProperty('kind')
      expect(patch).not.toHaveProperty('occurred_at')
      expect(summary.anonymized.activities).toBe(3)
    })
  })

  describe('Laura — échanges et mémoire (#1939)', () => {
    /**
     * Constat re-vérifié : `deleteAccount` n'a jamais touché `chat_messages`
     * ni la mémoire du copilote. Un compte supprimé laissait ses échanges
     * avec Laura en base, attribués pour toujours à `user_id`.
     */
    it('anonymise les messages avec Laura : l’auteur part, le CONTENU reste (fil partagé de l’espace)', async () => {
      const ctx = makeService()
      ctx.chatMessages.update.mockResolvedValue({ affected: 5 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.chatMessages.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch).toEqual({ user_id: null })
      // Le contenu n'est JAMAIS dans le correctif — un fil partagé de l'espace
      // (`ChatMessagesService` lit par `workspace_id`, jamais `user_id`) reste
      // lisible par les collègues qui le lisent encore.
      expect(patch).not.toHaveProperty('content')
      expect(patch).not.toHaveProperty('conversation_id')
      expect(patch).not.toHaveProperty('workspace_id')
      expect(summary.anonymized.chatMessages).toBe(5)
    })

    /** #2433.4 / #2433.12 (lot W8) — la vision d'une image est du texte LU dans la capture
     *  (zones citées, cellules d'un tableau) : elle part avec l'image, avant l'auteur. */
    it('efface la vision persistée des images AVANT de retirer l’auteur — le nom du fichier reste, le texte lu part', async () => {
      const ctx = makeService()
      const order: string[] = []
      ctx.chatMessages.query.mockImplementation(async () => {
        order.push('scrub')
        return []
      })
      ctx.chatMessages.update.mockImplementation(async () => {
        order.push('anonymize')
        return { affected: 1 } as never
      })

      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [sql, params] = ctx.chatMessages.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain("elem - 'regions' - 'objects'")
      expect(sql).toContain('user_id = $1')
      expect(params).toEqual([USER])
      expect(order).toEqual(['scrub', 'anonymize'])
    })

    it('NE distingue PAS un fil que personne d’autre n’a lu — même geste uniforme que les activités et le RAG', async () => {
      // Le dépôt ne vérifie JAMAIS la lecture d'un tiers avant de scruber une
      // activité ou un document RAG : c'est un geste UNIFORME, par `user_id`
      // seul. Une règle nouvelle ("s'il n'y a qu'un lecteur, faire autrement")
      // ne s'invente pas ici — même émission pour tous les fils.
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.chatMessages.update).toHaveBeenCalledTimes(1)
      expect(ctx.chatMessages.update.mock.calls[0][0]).toEqual({ user_id: USER })
    })

    /**
     * #2439.13 — LE CENTRE DONNÉES : « si une donnée ne peut pas être supprimée
     * immédiatement, expliquer pourquoi, limiter l'accès, journaliser. » Une
     * conservation légale posée par un gérant (`ChatConversationsService.setLegalHold`)
     * protège l'ATTRIBUTION des messages de CETTE conversation le temps qu'elle
     * court — le reste du fil de la personne (fil par défaut compris) part
     * normalement.
     */
    it('#2439.13 — une conversation sous conservation légale garde l’auteur de SES messages, pas des autres', async () => {
      const ctx = makeService()
      const HELD = 'conv-held'
      ctx.chatConversations.find.mockResolvedValue([
        { conversation_id: HELD, legal_hold_at: new Date(), legal_hold_by: 'manager-1', legal_hold_reason: 'Litige' },
      ] as never)
      ctx.chatMessages.count.mockResolvedValue(2)
      ctx.chatMessages.update.mockResolvedValue({ affected: 7 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.chatConversations.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ legal_hold_at: expect.anything() }) }),
      )
      expect(ctx.chatMessages.count).toHaveBeenCalledWith({
        where: { user_id: USER, conversation_id: expect.anything() },
      })
      const [criteria, patch] = ctx.chatMessages.update.mock.calls[0]
      // Deux clauses OR : le fil par défaut (`conversation_id IS NULL`) ET tout
      // le reste, SAUF les conversations tenues — jamais un `Not(In(...))` seul,
      // qui exclurait aussi les lignes NULL par la logique à trois valeurs SQL.
      expect(criteria).toEqual([
        { user_id: USER, conversation_id: expect.anything() },
        { user_id: USER, conversation_id: expect.anything() },
      ])
      expect(patch).toEqual({ user_id: null })
      expect(summary.anonymized.chatMessages).toBe(7)
      expect(summary.anonymized.chatMessagesKeptForLegalHold).toBe(2)
    })

    it('#2439.13 — aucune conservation légale nulle part : le geste simple d’avant, inchangé', async () => {
      const ctx = makeService()
      ctx.chatMessages.update.mockResolvedValue({ affected: 4 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.chatMessages.count).not.toHaveBeenCalled()
      expect(ctx.chatMessages.update).toHaveBeenCalledTimes(1)
      expect(ctx.chatMessages.update.mock.calls[0][0]).toEqual({ user_id: USER })
      expect(summary.anonymized.chatMessagesKeptForLegalHold).toBe(0)
    })

    /**
     * #1939 — décision Louis du 12/09 : « tout effacer tout de suite ». Le texte
     * d'un fil partagé reste (sans l'auteur) ; l'ENREGISTREMENT de sa voix, lui,
     * n'a aucun lecteur à préserver et aucune obligation de conservation — il part
     * maintenant, sans attendre ses 30 jours.
     */
    it('efface IMMÉDIATEMENT les enregistrements vocaux de cette personne, et le dit', async () => {
      const ctx = makeService()
      ctx.eraseVoiceMessages.mockResolvedValue({ erased: 3, deferred: 0 })

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.eraseVoiceMessages).toHaveBeenCalledTimes(1)
      expect(ctx.eraseVoiceMessages).toHaveBeenCalledWith(USER, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
      expect(summary.voiceMessages).toEqual({ erased: 3, deferredToNextPurge: 0 })
    })

    it('NON — ne peut atteindre ni un justificatif ni un document de besoin (conservation légale)', async () => {
      const ctx = makeService()
      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      // Le service ne tient AUCUNE référence au stockage : il reçoit un PORT à deux
      // arguments (la personne, le jour) — il n'a pas de domaine à passer, donc
      // pas de pièce d'entreprise à atteindre. Ce que le port touche est prouvé
      // par `voice-message-eraser.spec.ts` (une seule méthode) et la requête,
      // bornée au domaine vocal, par `storage-voice.service.spec.ts`.
      expect(ctx.eraseVoiceMessages).toHaveBeenCalledTimes(1)
      expect(ctx.eraseVoiceMessages.mock.calls[0]).toHaveLength(2)
      // Et la trace de ce qui est CONSERVÉ le dit toujours.
      expect(summary.retained.some(line => line.includes('expense_receipt') && line.includes('need_document'))).toBe(
        true,
      )
      expect(summary.retained.some(line => line.includes('chat_voice_message'))).toBe(false)
    })

    it('un magasin qui ne répond pas ne bloque pas le reste — et ne prétend pas avoir effacé', async () => {
      const ctx = makeService()
      ctx.eraseVoiceMessages.mockResolvedValue({ erased: 0, deferred: 2 })

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(summary.voiceMessages).toEqual({ erased: 0, deferredToNextPurge: 2 })
      expect(ctx.sessions.update).toHaveBeenCalled()
    })

    it('vide le résumé de conversation de cette personne (portée personnelle, jamais partagée)', async () => {
      const ctx = makeService()
      ctx.conversationSummaries.update.mockResolvedValue({ affected: 2 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.conversationSummaries.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch).toEqual({ summary: '' })
      expect(summary.anonymized.conversationSummaries).toBe(2)
    })

    /**
     * Relecture orchestrateur du 12/09 : `memory_pinned_facts` est une mémoire
     * PARTAGÉE de l'espace — `MemoryService.listFacts` (l'UNIQUE lecture, carte
     * « Mémoire » ET `ChatContextService.loadMemory`) ne filtre PAS par
     * `user_id` (`memory.service.ts:365-375`). Rédiger le TEXTE (comme le
     * faisait l'ancienne version) aurait donc affiché « [supprimé] » aux
     * collègues et l'aurait envoyé au modèle comme un fait. Même geste que
     * `chat_messages` : l'AUTEUR part, le CONTENU reste.
     */
    it('anonymise les faits épinglés par cette personne : l’auteur part, le CONTENU reste (mémoire partagée de l’espace)', async () => {
      const ctx = makeService()
      ctx.memoryFacts.update.mockResolvedValue({ affected: 1 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.memoryFacts.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch).toEqual({ user_id: null })
      // Le texte du fait n'est JAMAIS dans le correctif : un collègue qui lit
      // encore ce fait, ou le modèle à qui il est envoyé, doit voir le même
      // texte qu'avant — seul le lien vers la personne disparaît.
      expect(patch).not.toHaveProperty('fact')
      expect(patch).not.toHaveProperty('kind')
      expect(patch).not.toHaveProperty('expires_at')
      expect(summary.anonymized.memoryFacts).toBe(1)
    })

    /**
     * Décision Louis 13/09 : les traces d'intervention (`laura_interventions`)
     * sont EFFACÉES aussi — mémoire personnelle, cohérent avec « tout effacer
     * tout de suite ». Même geste que `MemoryService.forgetMine` pour sa 4e
     * couche « refusals » (`memory.service.ts:620-625`), qui traite déjà cette
     * table comme une mémoire qu'on OUBLIE (delete), pas qu'on scrube :
     * contrairement à un fil de discussion ou un fait épinglé, rien ici n'est
     * partagé avec l'équipe.
     */
    it('SUPPRIME (pour de bon) les traces d’intervention de cette personne — même geste que MemoryService.forgetMine', async () => {
      const ctx = makeService()
      ctx.lauraInterventions.count.mockResolvedValue(4)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.lauraInterventions.count).toHaveBeenCalledWith({ where: { user_id: USER } })
      expect(ctx.lauraInterventions.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(summary.deleted.lauraInterventions).toBe(4)
    })

    /**
     * #1919 — les retours d'une personne sur les réponses de Laura
     * (`chat_reply_feedback`) sont SA mémoire : lus dans son seul prompt, jamais
     * par un collègue. Même geste que `laura_interventions` : supprimés.
     *
     * ⚠️ Ce qui RESTE : une correction de donnée portée au DOSSIER d'un compte
     * (« Donnée fausse » › « aussi dans le dossier ») vit dans `account_feedback`,
     * la mémoire de l'ESPACE — ce service ne la touche pas, et le compte rendu le
     * dit dans `retained`.
     */
    it('SUPPRIME les retours de cette personne sur les réponses de Laura (#1919) — la correction du dossier reste', async () => {
      const ctx = makeService()
      ctx.replyFeedback.count.mockResolvedValue(5)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.replyFeedback.count).toHaveBeenCalledWith({ where: { user_id: USER } })
      expect(ctx.replyFeedback.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(summary.deleted.replyFeedback).toBe(5)
      expect(summary.retained.some(line => line.startsWith('account_feedback'))).toBe(true)
    })

    /**
     * Intégration du lot 3b (#1918.1, 13/09) — le point d'extension que #1939 a
     * laissé dans `anonymizeMemoryFacts`. Un fait « Toi uniquement »
     * (`scope = 'user'`) n'a AUCUN autre lecteur que son auteur
     * (`MemoryService.listFacts` : `scope = 'workspace' OR user_id = :viewer`).
     * Anonymisé comme un fait partagé, il restait en base, texte intact et sans
     * auteur : invisible de tous, jamais effacé — une donnée personnelle qui
     * survit à l'effacement. Il suit donc le sort de la mémoire personnelle :
     * supprimé, et AVANT le retrait de l'auteur, sans quoi son `user_id` serait
     * déjà NULL et plus rien ne le désignerait.
     */
    it('SUPPRIME les faits « Toi uniquement » de cette personne, AVANT de retirer l’auteur des faits partagés', async () => {
      const ctx = makeService()
      ctx.memoryFacts.count.mockResolvedValue(2)
      ctx.memoryFacts.update.mockResolvedValue({ affected: 1 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.memoryFacts.count).toHaveBeenCalledWith({ where: { user_id: USER, scope: 'user' } })
      expect(ctx.memoryFacts.delete).toHaveBeenCalledTimes(1)
      expect(ctx.memoryFacts.delete).toHaveBeenCalledWith({ user_id: USER, scope: 'user' })
      expect(ctx.memoryFacts.delete.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.memoryFacts.update.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      )
      expect(summary.deleted.personalMemoryFacts).toBe(2)
      // Les faits PARTAGÉS, eux, gardent leur texte : seul l'auteur part.
      expect(summary.anonymized.memoryFacts).toBe(1)
    })

    /**
     * #1916.24 — les traces « cet élément de mémoire était dans le contexte de
     * telle réponse » sont PERSONNELLES : elles disent ce que Laura avait en tête
     * pour les questions de CETTE personne. Effacées pour de bon, et seulement
     * les siennes — un collègue garde les traces de ses propres réponses.
     */
    it('#1916.24 — SUPPRIME les traces de mémoire de cette personne, et seulement les siennes', async () => {
      const ctx = makeService()
      ctx.replyMemoryUses.count.mockResolvedValue(7)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.replyMemoryUses.count).toHaveBeenCalledWith({ where: { user_id: USER } })
      expect(ctx.replyMemoryUses.delete).toHaveBeenCalledTimes(1)
      expect(ctx.replyMemoryUses.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(summary.deleted.replyMemoryUses).toBe(7)
    })

    it('#1916.24 — sans le dépôt des traces, le compte rendu dit « non mesuré » (null), jamais 0', async () => {
      const ctx = makeService()
      const bare = new PrivacyDeletionService(
        ctx.profiles as never,
        ctx.contacts as never,
        ctx.consultants as never,
        ctx.ragDocuments as never,
        ctx.activities as never,
        ctx.chatMessages as never,
        ctx.conversationSummaries as never,
        ctx.memoryFacts as never,
        ctx.preferences as never,
        ctx.lauraInterventions as never,
        // #1919 — `replyFeedback`, OBLIGATOIRE et intercalé ici par la fusion du
        // 13/09 : sans lui, tous les dépôts suivants glissaient d'un rang.
        ctx.replyFeedback as never,
        ctx.threadTitles as never,
        ctx.sessions as never,
        ctx.subscriptions as never,
        ctx.workspaces as never,
        { cancelSubscription: ctx.cancelSubscription } as unknown as StripeService,
        ctx.memoryFactEvents as never,
        // #1938.4, #1939.9 et #2439.13 — obligatoires, avant le seul
        // `@Optional()` de ce constructeur : les omettre décalerait
        // `replyMemoryUses`, que ce test veut justement ABSENT.
        ctx.smsChannels as never,
        ctx.eraseVoiceMessages,
        ctx.chatConversations as never,
        ctx.eraseImageAttachments,
      )

      const summary = await bare.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(summary.deleted.replyMemoryUses).toBeNull()
    })

    it('vide le sac de préférences personnelles (table strictement personnelle)', async () => {
      const ctx = makeService()

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.preferences.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch).toEqual({ preferences: {} })
      expect(summary.anonymized.preferencesCleared).toBe(true)
    })

    /**
     * Revue d'intégration du lot fils (13/09) — deux branches écrites en
     * parallèle : l'effacement (#1939) retire l'auteur des messages et des
     * faits épinglés, pendant que les titres de fil (#1911.1) posaient
     * `chat_thread_titles.set_by` — l'identifiant de qui a saisi (ou déclenché)
     * un titre. Sans ce geste, un compte effacé restait attaché pour toujours
     * aux titres des fils de son espace. Même geste que `chat_messages` : le
     * TITRE reste (il nomme un fil partagé), seul le lien vers la personne part.
     */
    it('retire l’auteur des titres de fil posés par cette personne — le titre reste (fil partagé)', async () => {
      const ctx = makeService()
      ctx.threadTitles.update.mockResolvedValue({ affected: 3 } as never)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.threadTitles.update).toHaveBeenCalledTimes(1)
      const [criteria, patch] = ctx.threadTitles.update.mock.calls[0]
      expect(criteria).toEqual({ set_by: USER })
      expect(patch).toEqual({ set_by: null })
      expect(patch).not.toHaveProperty('title')
      expect(patch).not.toHaveProperty('workspace_id')
      expect(ctx.threadTitles.delete).not.toHaveBeenCalled()
      expect(summary.anonymized.threadTitles).toBe(3)
    })

    /**
     * LE TEST QUI DIT NON — un compte A supprimé n'altère AUCUN message d'un
     * compte B. Chaque appel de correction est borné à `{ user_id: USER }`,
     * jamais à un filtre plus large (`{}`, tous les fils du workspace, etc.).
     */
    it('NE touche JAMAIS un autre compte — chaque écriture est bornée au SEUL user_id appelant', async () => {
      const ctx = makeService()
      // Un élément « moi seul » existe : sans lui la suppression ne part pas, et
      // vérifier ses critères serait vrai par vacuité.
      ctx.memoryFacts.count.mockResolvedValue(1)
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      for (const repo of [ctx.chatMessages, ctx.conversationSummaries, ctx.preferences]) {
        expect(repo.update).toHaveBeenCalledTimes(1)
        const [criteria] = repo.update.mock.calls[0]
        expect(criteria).toEqual({ user_id: USER })
        expect(criteria).not.toEqual({})
      }
      // Les faits épinglés : l'auteur, puis le confirmateur (Q1) — chaque critère
      // porte le SEUL compte effacé.
      expect(ctx.memoryFacts.update.mock.calls.map(([criteria]) => criteria)).toEqual([
        { user_id: USER },
        { confirmed_by: USER },
      ])
      expect(ctx.chatMessages.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ user_id: OTHER_USER }),
        expect.anything(),
      )
      // Jamais un HARD-delete sur la mémoire PARTAGÉE du copilote non plus…
      expect(ctx.chatMessages.delete).not.toHaveBeenCalled()
      expect(ctx.conversationSummaries.delete).not.toHaveBeenCalled()
      expect(ctx.preferences.delete).not.toHaveBeenCalled()
      // …sauf les éléments « Toi uniquement » (#1939 × #1918.1, décision 12/09
      // batch 6) : bornés au compte effacé ET à la portée privée, jamais `{}`, ni
      // un autre compte, ni la seule borne d'auteur (un élément partagé).
      expect(ctx.memoryFacts.delete).toHaveBeenCalledTimes(1)
      expect(ctx.memoryFacts.delete).toHaveBeenCalledWith({ user_id: USER, scope: 'user' })
      expect(ctx.memoryFacts.delete).not.toHaveBeenCalledWith({ user_id: USER })
      // `laura_interventions` EST hard-deleted (décision Louis 13/09) — mais
      // borné au SEUL user_id appelant, jamais `{}` ni un autre compte.
      expect(ctx.lauraInterventions.delete).toHaveBeenCalledTimes(1)
      expect(ctx.lauraInterventions.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(ctx.lauraInterventions.delete).not.toHaveBeenCalledWith({})
      expect(ctx.lauraInterventions.delete).not.toHaveBeenCalledWith({ user_id: OTHER_USER })
      // #1919 — `chat_reply_feedback` aussi : hard-delete, borné au SEUL appelant.
      expect(ctx.replyFeedback.delete).toHaveBeenCalledTimes(1)
      expect(ctx.replyFeedback.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(ctx.replyFeedback.delete).not.toHaveBeenCalledWith({})
      expect(ctx.replyFeedback.delete).not.toHaveBeenCalledWith({ user_id: OTHER_USER })
      expect(ctx.replyFeedback.count).not.toHaveBeenCalledWith({ where: {} })
    })
  })

  /**
   * #1939 + décision 12/09 batch 6 (« effacées aussi »), appliquée par analogie à
   * la mémoire : les éléments « moi seul » d'un compte effacé sont SUPPRIMÉS.
   * Avant, ils perdaient leur auteur (`user_id` → null) — plus personne ne pouvait
   * les lire (la portée privée n'admet que leur auteur), mais le TEXTE restait en
   * base pour toujours. Un élément PARTAGÉ, lui, a d'autres lecteurs : il garde
   * son contenu et perd seulement l'auteur, comme avant.
   *
   * Contre des tables qui APPLIQUENT les critères : ce qui reste en base est
   * vérifié, pas seulement les arguments passés.
   */
  describe('mémoire « moi seul » à l’effacement (#1939 + décision 12/09 batch 6)', () => {
    function withMemory(facts: FactRow[], events: EventRow[] = []) {
      const ctx = makeService()
      const factTable = applyingTable(facts)
      const eventTable = applyingTable(events)
      Object.assign(ctx.memoryFacts, { count: factTable.count, update: factTable.update, delete: factTable.delete })
      Object.assign(ctx.memoryFactEvents, {
        count: eventTable.count,
        update: eventTable.update,
        delete: eventTable.delete,
      })
      return { ctx, factTable, eventTable }
    }

    const corpus = (): FactRow[] => [
      { id: 'mine-private', user_id: USER, scope: 'user', fact: 'Mon objectif perso', confirmed_by: null },
      { id: 'mine-shared', user_id: USER, scope: 'workspace', fact: 'Règle de l’ESN', confirmed_by: null },
      { id: 'other-private', user_id: OTHER_USER, scope: 'user', fact: 'Objectif du collègue', confirmed_by: null },
      { id: 'other-shared', user_id: OTHER_USER, scope: 'workspace', fact: 'Note confirmée', confirmed_by: USER },
    ]

    it('supprime les éléments « moi seul » du compte effacé, et le COMPTE dans le résumé', async () => {
      const { ctx, factTable } = withMemory(corpus())

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(factTable.rows.map(row => row.id)).not.toContain('mine-private')
      expect(summary.deleted.personalMemoryFacts).toBe(1)
    })

    it('NON — un élément PARTAGÉ du compte effacé n’est jamais supprimé : il garde son texte, perd son auteur', async () => {
      const { ctx, factTable } = withMemory(corpus())

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(factTable.rows.find(row => row.id === 'mine-shared')).toEqual({
        id: 'mine-shared',
        user_id: null,
        scope: 'workspace',
        fact: 'Règle de l’ESN',
        confirmed_by: null,
      })
      expect(summary.anonymized.memoryFacts).toBe(1)
    })

    it('NON — les éléments d’un AUTRE compte restent intacts, privés comme partagés (seul le confirmateur effacé part)', async () => {
      const { ctx, factTable } = withMemory(corpus())

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(factTable.rows.find(row => row.id === 'other-private')).toEqual(corpus()[2])
      expect(factTable.rows.find(row => row.id === 'other-shared')).toEqual({ ...corpus()[3], confirmed_by: null })
      expect(summary.anonymized.memoryFactConfirmations).toBe(1)
    })

    it('NON — la suppression porte le compte ET la portée privée : jamais `{}`, jamais un autre compte, jamais sans portée', async () => {
      const { ctx, factTable } = withMemory(corpus())

      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(factTable.delete.mock.calls).toEqual([[{ user_id: USER, scope: 'user' }]])
    })

    it('supprime AVANT d’anonymiser : un élément privé dont on retirerait d’abord l’auteur échapperait à la suppression', async () => {
      const { ctx, factTable } = withMemory(corpus())

      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      // Aucun élément « moi seul » orphelin ne subsiste : c'était exactement le défaut.
      expect(factTable.rows.filter(row => row.scope === 'user' && row.user_id === null)).toEqual([])
    })

    it('retire l’auteur des gestes de l’historique d’un élément partagé — le geste reste, jamais celui d’un autre compte', async () => {
      const { ctx, eventTable } = withMemory(corpus(), [
        { id: 'ev-1', fact_id: 'mine-shared', actor_user_id: USER },
        { id: 'ev-2', fact_id: 'other-shared', actor_user_id: OTHER_USER },
      ])

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(eventTable.rows).toEqual([
        { id: 'ev-1', fact_id: 'mine-shared', actor_user_id: null },
        { id: 'ev-2', fact_id: 'other-shared', actor_user_id: OTHER_USER },
      ])
      expect(eventTable.delete).not.toHaveBeenCalled()
      expect(summary.anonymized.memoryFactEvents).toBe(1)
    })

    it('un compte sans mémoire ne supprime rien et le dit : zéro élément, pas une erreur', async () => {
      const { ctx } = withMemory([])

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(summary.deleted.personalMemoryFacts).toBe(0)
      expect(summary.anonymized.memoryFacts).toBe(0)
    })
  })

  describe('sessions', () => {
    it('revokes ALL of the user’s devices', async () => {
      const ctx = makeService()
      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      const [criteria, patch] = ctx.sessions.update.mock.calls[0]
      expect(criteria).toEqual({ user_id: USER })
      expect(patch.revoked_at).toBeInstanceOf(Date)
      expect(summary.sessionsRevoked).toBe(1)
    })
  })

  describe('Stripe billing', () => {
    it('cancels an active subscription without charging', async () => {
      const ctx = makeService()
      ctx.subscriptions.findOne.mockResolvedValue({ stripe_subscription_id: 'sub_live' })

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.cancelSubscription).toHaveBeenCalledWith('sub_live')
      expect(summary.subscriptionCanceled).toBe(true)
    })

    it('skips cancellation when there is no live subscription', async () => {
      const ctx = makeService()
      ctx.subscriptions.findOne.mockResolvedValue({ stripe_subscription_id: null })

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.cancelSubscription).not.toHaveBeenCalled()
      expect(summary.subscriptionCanceled).toBe(false)
    })

    it('does not fail the erasure if Stripe errors (best-effort)', async () => {
      const ctx = makeService()
      ctx.subscriptions.findOne.mockResolvedValue({ stripe_subscription_id: 'sub_live' })
      ctx.cancelSubscription.mockRejectedValue(new Error('stripe down'))

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(summary.subscriptionCanceled).toBe(false)
      // PII scrubbing still happened despite the billing hiccup.
      expect(ctx.profiles.update).toHaveBeenCalled()
    })
  })

  describe('scoping', () => {
    it('never targets a user other than the caller, and keeps legal records', async () => {
      const ctx = makeService()
      // Un élément « moi seul » existe, pour que la suppression parte et soit vérifiée.
      ctx.memoryFacts.count.mockResolvedValue(1)
      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      for (const repo of [
        ctx.profiles,
        ctx.contacts,
        ctx.ragDocuments,
        ctx.sessions,
        ctx.chatMessages,
        ctx.conversationSummaries,
        ctx.preferences,
      ]) {
        for (const call of repo.update.mock.calls) {
          expect(call[0]).toEqual({ user_id: USER })
        }
      }
      for (const [criteria] of ctx.memoryFacts.update.mock.calls) {
        expect(Object.values(criteria as Record<string, unknown>)).toEqual([USER])
      }
      for (const [criteria] of ctx.memoryFactEvents.update.mock.calls) {
        expect(criteria).toEqual({ actor_user_id: USER })
      }
      // Deletion never HARD-deletes anything — only anonymises/updates.
      // DEUX EXCEPTIONS nommées : `laura_interventions` (décision Louis 13/09) et
      // les éléments de mémoire « moi seul » (#1939 + décision 12/09 batch 6) —
      // tous deux une mémoire personnelle sans autre lecteur.
      expect(ctx.profiles.delete).not.toHaveBeenCalled()
      expect(ctx.contacts.delete).not.toHaveBeenCalled()
      expect(ctx.chatMessages.delete).not.toHaveBeenCalled()
      expect(ctx.conversationSummaries.delete).not.toHaveBeenCalled()
      expect(ctx.memoryFacts.delete).toHaveBeenCalledWith({ user_id: USER, scope: 'user' })
      expect(ctx.memoryFactEvents.delete).not.toHaveBeenCalled()
      expect(ctx.preferences.delete).not.toHaveBeenCalled()
      expect(ctx.lauraInterventions.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(summary.retained.length).toBeGreaterThan(0)
    })
  })

  /**
   * #1938.4 — décision Louis 13/09 batch 13. Le numéro de mobile saisi pour les
   * alertes SMS est une donnée PERSONNELLE, jamais partagée (une ligne par
   * personne, lue par elle seule) : rien ne justifie de l'anonymiser en place,
   * la ligne est SUPPRIMÉE — même geste que `laura_interventions`.
   */
  describe('canal SMS des alertes urgentes (#1938.4)', () => {
    it('SUPPRIME le numéro, sa vérification et les choix SMS de cette personne', async () => {
      const ctx = makeService()
      ctx.smsChannels.count.mockResolvedValue(1)

      const summary = await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.smsChannels.count).toHaveBeenCalledWith({ where: { user_id: USER } })
      expect(ctx.smsChannels.delete).toHaveBeenCalledWith({ user_id: USER })
      expect(summary.deleted.smsChannel).toBe(1)
    })

    it('NE touche JAMAIS le numéro d’un autre compte, et ne vide jamais la table', async () => {
      const ctx = makeService()
      await ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)

      expect(ctx.smsChannels.delete).toHaveBeenCalledTimes(1)
      expect(ctx.smsChannels.delete).not.toHaveBeenCalledWith({})
      expect(ctx.smsChannels.delete).not.toHaveBeenCalledWith({ user_id: OTHER_USER })
      // Supprimé, pas « anonymisé » : aucun numéro de remplacement n'est écrit.
      expect(ctx.smsChannels.update).not.toHaveBeenCalled()
    })

    it('une salle de démonstration refusée ne touche pas non plus au canal SMS', async () => {
      const ctx = makeService()
      ctx.workspaces.findOne.mockResolvedValue({ id: 'ws-demo', is_demo: true } as never)
      await expect(ctx.service.deleteAccount(USER, DELETION_CONFIRMATION)).rejects.toBeInstanceOf(BadRequestException)
      expect(ctx.smsChannels.delete).not.toHaveBeenCalled()
    })
  })
})
