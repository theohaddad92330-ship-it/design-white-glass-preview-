import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  type HttpException,
} from '@nestjs/common'
import { normalizeMailBody } from '../activities/mail-body'
import {
  MAIL_THREAD_DEFAULT_WINDOW_DAYS,
  MAIL_THREAD_MAX_CHARS,
  MAIL_THREAD_MAX_MESSAGES,
  pickThreadMessages,
  type MailThreadText,
  type MailThreadTextMessage,
} from './mail-thread-text'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  BATCH_ABORT_AFTER_FAILURES,
  mailBatchRequestSchema,
  mailDraftRequestSchema,
  mailSearchRequestSchema,
  type MailAttachment,
  type MailboxProvider,
  type MailDraftRequest,
  type MailDraftResult,
  type MailMessage,
  type MailSearchRequest,
  type MailSearchResponse,
  type MailThread,
  type MailBatchOutcome,
  type MailBatchRequest,
  type MailBatchResult,
  type MailboxSender,
  type MailboxStatus,
  type MailThreadMark,
  type OutOfOfficeRequest,
  type OutreachSequencePauseEvent,
  type OutreachSequenceStopEvent,
  buildTriggerEvent,
  triggerPeriodQualifier,
  outreachReplyEffect,
} from '@bellum/contracts'
import { connectorFailure } from '../../common/connector-error'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MailBatchEntity } from '../../database/entities/mail-batch.entity'
import { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import {
  demoMailDraft,
  demoMailSearch,
  demoMailThreadText,
  demoMailboxStatus,
  demoOutOfOffice,
} from '../demo/demo-briefing'
import { SuppressionService } from '../mailer/suppression.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { computeMailThreadCommercialState } from './mail-commercial-state'
import { latestSentProofByThread } from './mail-sent-proof'
import { computeMailThreadPriority, positiveReplyThreadIds, sortByPriority } from './mail-priority'
import { buildMailQuery, type MailQuerySpec } from './mail-query'
import {
  MAILBOX_BACKENDS,
  MAILBOX_SCOPES,
  type MailboxBackend,
  type MailboxCapability,
  type MailboxReadScope,
  type OutgoingMailAttachment,
  type MailSendReceipt,
} from './mailbox-backend'
import { groupIntoThreads, normalizeAddress, selectAwaitingReply, selectPositiveReplies } from './no-reply'
import { classifyThread } from './reply-classify'
import {
  buildThreadAccountIndex,
  linkThreadToAccount,
  toAccountRef,
  toContactRef,
  type ContactAnchor,
} from './thread-account-link'

/**
 * LA messagerie de l'utilisateur — une seule, quel que soit l'éditeur derrière.
 *
 * Le service choisit le backend connecté et n'expose plus jamais lequel c'est
 * au reste du produit (doctrine « aucun nom de fournisseur côté app ») : les
 * écrans disent « ta messagerie », le champ `provider` de la réponse ne sert
 * qu'à Réglages › Intégrations et au support.
 *
 * Quand DEUX messageries sont connectées, la première de la liste gagne. Ce
 * n'est pas un arbitrage produit dissimulé : c'est le cas d'une organisation
 * qui migre, et laisser l'utilisateur avec deux boîtes moitié-lues serait pire
 * que d'en désigner une. L'écran Intégrations montre les deux et permet de
 * déconnecter celle qu'on ne veut plus.
 */
/** #4016 L3 — combien de messages la recherche remonte pour retrouver UN fil. */
const MAIL_THREAD_SEARCH_LIMIT = 50

/** La raison d'un échec fournisseur — son message d'erreur (jamais un contenu de mail), borné. */
function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').slice(0, 200)
}

/** #4181.3 — la nature, dans `action_dispatch_attempts`, d'un brouillon de relance « sans réponse » préparé. */
const FOLLOW_UP_DRAFT_INTENT = 'no_reply_followup_draft'

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name)

  constructor(
    @Inject(MAILBOX_BACKENDS) private readonly backends: MailboxBackend[],
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(MailBatchEntity) private readonly batches: Repository<MailBatchEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    // #2104.6/.7/.8 — la décision manuelle (traité, non pertinent, rattaché)
    // portée par l'utilisateur sur un fil.
    @InjectRepository(MailThreadMarkEntity) private readonly marks: Repository<MailThreadMarkEntity>,
    // #2104.6 — vérifier qu'un rattachement manuel désigne un compte du bon espace.
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    // #2955 (#2394.57) — LECTURE SEULE de l'état de conversation déjà persisté
    // (`context.mail_threads`), jamais une écriture : voir `mailbox.module.ts`.
    @InjectRepository(ChatMessageEntity) private readonly chatMessages: Repository<ChatMessageEntity>,
    private readonly suppression: SuppressionService,
    private readonly workspaceContext: WorkspaceContextService,
    /**
     * #2875/#2402.3 (lot V11) — le registre unique des déclencheurs
     * commerciaux. `@Optional()` : sans le service, la réconciliation
     * séquence/réponse (#2381) garde son comportement d'avant, au bit près —
     * seule la persistance canonique best-effort disparaît.
     */
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {}

  /** Statut agrégé : la première messagerie connectée, ou « aucune ». */
  async status(userId: string): Promise<MailboxStatus> {
    // Salle de démonstration : boîte fictive, annoncée comme telle
    // (`demo@bellum.example`). Sans elle l'écran s'ouvrirait sur « connecte ta
    // messagerie » devant un prospect qui, par construction, ne connectera rien.
    if (await this.workspaceContext.isDemoWorkspace(userId)) return demoMailboxStatus()
    const connected = await this.connectedBackend(userId)
    if (!connected) {
      return {
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
        connectedCount: 0,
      }
    }
    // #2756 — sondé une seconde fois, cette fois SANS s'arrêter au premier
    // gagnant : c'est ce qui manquait à l'écran pour dire « une autre
    // messagerie est aussi branchée » au lieu de se taire dessus.
    const connectedCount = await this.countConnected(userId)
    return { ...connected.status, connectedCount }
  }

  /**
   * « Aucune messagerie connectée » — un ÉTAT, dit avec le code que l'écran lit.
   *
   * Dix `BadRequestException` nus vivaient ici — le signalement en comptait « au
   * moins sept », il y en avait dix : six « aucune messagerie connectée » et
   * quatre « reconnecte-la ». Un 400 sans `code`, que
   * `api-error.ts` ne peut pas distinguer d'une saisie invalide. L'écran, lui,
   * branche depuis toujours sur `not_connected` et `scope_missing`
   * (`MailboxPage.tsx:41-42`) — il attendait des codes qui n'arrivaient jamais,
   * et retombait donc sur « la recherche a échoué » avec un bouton « Réessayer »
   * là où il n'y a rien à réessayer : il n'y a rien de branché.
   */
  private notConnected(): HttpException {
    return connectorFailure({
      code: 'not_connected',
      // Aucun fournisseur n'est branché : en nommer un serait faux. Ce champ est
      // de la DONNÉE (journaux, Réglages › Intégrations), jamais du texte d'écran.
      provider: 'mailbox',
      capability: 'mail',
      message: 'Aucune messagerie connectée.',
    })
  }

  /**
   * La capacité manque : ce n'est pas une panne, c'est une portée jamais
   * accordée. Elle ne repassera pas toute seule — un jeton OAuth ne s'élargit
   * pas après coup — donc « réessaie dans un moment » serait un mensonge qui
   * coûte une journée. D'où `scope_missing`, et la portée NOMMÉE avec lui.
   */
  private missingCapability(
    status: Omit<MailboxStatus, 'connectedCount'>,
    capability: MailboxCapability,
    message: string,
  ): HttpException {
    return connectorFailure({
      code: 'scope_missing',
      provider: status.provider ?? 'mailbox',
      capability: 'mail',
      // `[]` seulement si le fournisseur est inconnu — on n'invente pas une portée.
      scopes: status.provider ? MAILBOX_SCOPES[status.provider][capability] : [],
      message,
    })
  }

  /**
   * #2955 (#2394.57, décision Louis 28/09) — au-delà, une recherche est
   * TRONQUÉE plutôt que calculée sur une partie qu'elle ne nomme pas (même
   * raisonnement que `THREAD_SEARCH_SCAN_LIMIT`, `chat-messages.service.ts`) :
   * mais ici, `null` au-delà de la borne se lit exactement comme « fil non vu »
   * (non mesuré), jamais comme un refus — la borne ne PEUT donc jamais bloquer
   * un dépôt à tort, seulement manquer de le VALIDER par preuve.
   */
  private static readonly MAIL_THREAD_LOOKUP_SCAN_LIMIT = 200

  /**
   * Les participants d'un fil `threadId`, lus dans l'état DÉJÀ PERSISTÉ de la
   * conversation `/chat` (`context.mail_threads`, whitelist
   * `persistedChatContextSchema`) — jamais une nouvelle méthode de lecture de
   * LA MESSAGERIE, jamais le corps d'un message (D65).
   *
   * `null` = ce fil n'a été vu par AUCUN message de CETTE conversation : NON
   * MESURÉ, jamais confondu avec « aucun participant connu » — l'appelant ne
   * bloque jamais sur cette valeur, seulement sur une liste qui EXCLUT le
   * destinataire.
   */
  private async knownMailThreadParticipants(
    workspaceId: string,
    conversationId: string,
    threadId: string,
  ): Promise<string[] | null> {
    const rows = await this.chatMessages.find({
      where: { workspace_id: workspaceId, conversation_id: conversationId, role: 'assistant' },
      select: ['context'],
      order: { created_at: 'DESC' },
      take: MailboxService.MAIL_THREAD_LOOKUP_SCAN_LIMIT,
    })
    for (const row of rows) {
      const hit = row.context?.mail_threads?.find(entry => entry.thread_id === threadId)
      if (hit) return hit.participants.map(normalizeAddress)
    }
    return null
  }

  /**
   * La première messagerie connectée — hors celles que `scope` exclut (#3973,
   * « Outils et sources ») : une boîte décochée pour ce fil n'est jamais lue,
   * et la suivante branchée prend sa place. Sans `scope`, inchangé.
   */
  private async connectedBackend(
    userId: string,
    scope: MailboxReadScope = {},
  ): Promise<{ backend: MailboxBackend; status: Omit<MailboxStatus, 'connectedCount'> } | null> {
    const excluded = new Set(scope.excludedProviders ?? [])
    for (const backend of this.backends) {
      try {
        const status = await backend.status(userId)
        if (status?.connected && !(status.provider && excluded.has(status.provider))) return { backend, status }
      } catch (error) {
        // Une messagerie indisponible ne doit pas masquer l'autre.
        this.logger.warn(`Mailbox status probe failed: ${(error as Error).message}`)
      }
    }
    return null
  }

  /**
   * #2756 — combien de messageries répondent RÉELLEMENT connectées, tous
   * backends confondus. Sonde CHACUN (contrairement à `connectedBackend`, qui
   * s'arrête à la première) : c'est le seul moyen de savoir qu'une seconde
   * boîte est branchée derrière celle qui gagne l'arbitrage. Une messagerie en
   * panne ne compte pas — même défaut que `connectedBackend` : elle ne doit
   * ni gagner, ni se faire compter.
   *
   * Appelée UNE FOIS, par `status()` seul — les dix autres appelants de
   * `connectedBackend` (recherche, brouillon, envoi…) n'ont besoin que du
   * gagnant, jamais du total ; leur faire payer une seconde sonde par appel
   * serait un coût sans lecteur.
   */
  private async countConnected(userId: string): Promise<number> {
    let count = 0
    for (const backend of this.backends) {
      try {
        const status = await backend.status(userId)
        if (status?.connected) count += 1
      } catch (error) {
        this.logger.warn(`Mailbox status probe failed: ${(error as Error).message}`)
      }
    }
    return count
  }

  /**
   * Recherche par intention métier.
   *
   * L'agrégation en fils est faite ici et pas dans les backends : c'est la même
   * règle pour tout le monde, et la dupliquer serait la meilleure façon
   * d'obtenir deux définitions divergentes de « ce fil attend une réponse ».
   */
  async search(userId: string, input: MailSearchRequest, scope: MailboxReadScope = {}): Promise<MailSearchResponse> {
    const request = mailSearchRequestSchema.parse(input)
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      const demo = demoMailSearch(request.intent, new Date(), request.counterpart)
      // #2104.14/.15/.16/.17 — LA SALLE DE DÉMONSTRATION REÇOIT AUSSI LE
      // CLASSEMENT. `mail_thread_marks` fonctionne réellement en démo (aucun
      // connecteur externe n'est appelé, voir `DEMO_INTENTIONALLY_EMPTY`
      // dans `demo-coverage.ts`) : un visiteur qui marque un fil fictif
      // « traité » doit le voir retomber au niveau 6 comme un vrai compte.
      //
      // Pas de MESSAGES bruts en démo (les fils fictifs ne portent que leur
      // résumé) : `positiveReplyThreadIds` ne peut donc pas s'appliquer telle
      // quelle. La même définition que `demoMailSearch` utilise déjà pour son
      // propre onglet « réponses favorables » (dernier message ENTRANT, non
      // lu — juste au-dessus dans ce même service) sert ici de repli honnête.
      const demoPositive = new Set(
        demo.threads.filter(t => t.lastDirection === 'inbound' && !t.unread).map(t => t.threadId),
      )
      return { ...demo, threads: await this.presentThreads(userId, demo.threads, demoPositive, request) }
    }
    const connected = await this.connectedBackend(userId, scope)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.read) {
      throw this.missingCapability(
        connected.status,
        'read',
        'La messagerie connectée ne donne pas accès à la lecture. Reconnecte-la pour activer cette fonction.',
      )
    }

    const spec = buildMailQuery(request)
    const outcome = await connected.backend.search(userId, spec, request.limit)
    const threads = groupIntoThreads(outcome.messages)

    const selected = this.selectThreads(request, threads, outcome.messages)
    const shown = selected.slice(0, request.limit)

    // Le contexte métier, ajouté APRÈS la sélection : on ne résout le compte
    // que des fils réellement affichés (MAIL-01). Best-effort — une lecture en
    // échec laisse `account: null`, jamais une recherche qui tombe.
    const withAccounts = await this.withAccountContext(userId, shown)

    // #2381.1/.3/.4/.5/.6 — une réponse entrante ARRÊTE (ou met en pause) la
    // séquence de ce contact, une fois le contact résolu AVEC CERTITUDE.
    // Best-effort : ne doit jamais faire tomber une recherche.
    // PERF (P5, 29/09) — la réconciliation (écrit sur les séquences) et le
    // classement des fils (lit les marques) ne se lisent pas l'un l'autre : ils
    // partent ensemble au lieu de s'enchaîner.
    const positive = positiveReplyThreadIds(threads, outcome.messages)
    const [, , presentedThreads] = await Promise.all([
      this.reconcileReplySequences(userId, withAccounts).catch((error: unknown) => {
        this.logger.warn(`Reply→sequence reconciliation skipped: ${(error as Error).message}`)
      }),
      // #4016 L13c — « Envoyé » détecté dans la boîte = preuve d'envoi.
      this.reconcileSentProofs(userId, withAccounts, outcome.messages).catch((error: unknown) => {
        this.logger.warn(`Sent-proof reconciliation skipped: ${(error as Error).message}`)
      }),
      this.presentThreads(userId, withAccounts, positive, request),
    ])

    return {
      provider: connected.status.provider ?? 'google',
      intent: request.intent,
      threads: presentedThreads,
      resolvedQuery: outcome.resolvedQuery,
      truncated: outcome.truncated || selected.length > request.limit,
    }
  }

  /**
   * LE CLASSEMENT FINAL (#2104.14/.15/.16/.17) : l'état unifié, le niveau de
   * priorité et sa raison, PUIS le tri — dans cet ordre, parce que trier sans
   * avoir calculé le niveau n'aurait rien à trier.
   *
   * `positive` porte les identifiants de fil déjà détectés comme une réponse
   * favorable (`positiveReplyThreadIds`, sur l'ensemble des messages lus —
   * jamais sur les seuls fils affichés, qui pourraient couper un fil de son
   * historique). Un paramètre plutôt qu'un recalcul ICI : la démo n'a pas de
   * messages bruts et détecte le même signal autrement (voir `search`).
   *
   * Best-effort : une lecture des marques en échec ne fait pas tomber la
   * recherche, elle rend simplement le fil comme si aucune décision manuelle
   * n'avait été posée — même contrat que `withAccountContext`.
   */
  private async presentThreads(
    userId: string,
    threads: MailThread[],
    positive: Set<string>,
    request: MailSearchRequest,
  ): Promise<MailThread[]> {
    if (threads.length === 0) return threads
    const marks = await this.loadMarks(
      userId,
      threads.map(thread => thread.threadId),
    )

    const presented = threads.map(thread => {
      const mark = marks.get(thread.threadId) ?? null
      const priority = computeMailThreadPriority(
        thread,
        positive.has(thread.threadId),
        request.silenceDays,
        mark?.state ?? null,
      )
      // #2104.6 — le rattachement MANUEL l'emporte sur l'auto-détection : un
      // utilisateur qui a corrigé le compte à la main a raison contre un
      // domaine ambigu ou une adresse inconnue (doctrine « une correction
      // humaine gagne toujours »).
      const manualAccount =
        mark?.accountId && mark.accountName
          ? { id: mark.accountId, name: mark.accountName, via: 'manual' as const }
          : null
      return {
        ...thread,
        account: manualAccount ?? thread.account,
        state: priority.state,
        priorityLevel: priority.level,
        priorityReason: priority.reason,
        // Théo B M2.N3 — un report encore à venir ; échu, il ne dit plus rien (le fil est revenu).
        ...(mark?.snoozeUntil && new Date(mark.snoozeUntil).getTime() > Date.now()
          ? { snoozeUntil: new Date(mark.snoozeUntil).toISOString() }
          : {}),
        // #2393.2 — trois des douze états commerciaux, calculés mécaniquement ;
        // `null` pour les neuf qui demanderaient de lire le sens du message.
        commercialState: computeMailThreadCommercialState(thread, positive.has(thread.threadId), mark?.state ?? null),
      }
    })

    return sortByPriority(presented)
  }

  /** Les décisions manuelles déjà posées sur ces fils, par identifiant de fil. */
  private async loadMarks(
    userId: string,
    threadIds: string[],
  ): Promise<
    Map<
      string,
      { state: MailThreadMark | null; accountId: string | null; accountName: string | null; snoozeUntil?: Date | null }
    >
  > {
    if (threadIds.length === 0) return new Map()
    try {
      const rows = await this.marks
        .createQueryBuilder('m')
        .leftJoin('accounts', 'a', 'a.id = m.account_id')
        .select('m.thread_id', 'threadId')
        .addSelect('m.state', 'state')
        .addSelect('m.account_id', 'accountId')
        .addSelect('a.company_name', 'accountName')
        .addSelect('m.snooze_until', 'snoozeUntil')
        .where('m.user_id = :userId', { userId })
        .andWhere('m.thread_id IN (:...threadIds)', { threadIds })
        .getRawMany<{
          threadId: string
          state: MailThreadMark | null
          accountId: string | null
          accountName: string | null
          snoozeUntil: Date | null
        }>()
      return new Map(rows.map(row => [row.threadId, row]))
    } catch (error) {
      this.logger.warn(`Mail thread marks lookup skipped: ${(error as Error).message}`)
      return new Map()
    }
  }

  /**
   * La fenêtre récente de la boîte, MESSAGE par message — la matière de la
   * capture d'activités (T2).
   *
   * Distincte de `search`, qui agrège en fils : la timeline d'un compte
   * s'écrit ligne par ligne, et un fil de sept messages est sept événements
   * datés, pas un.
   *
   * Rend `null` — et non une liste vide — quand rien n'est branché ou que la
   * portée de lecture manque. Une liste vide se lirait « ta boîte est vide »,
   * ce qui est le mensonge exact que la capture doit éviter.
   */
  async listRecentMessages(
    userId: string,
    options: { windowDays: number; limit: number },
  ): Promise<{ provider: MailboxProvider; messages: MailMessage[]; ownAddress: string | null } | null> {
    const connected = await this.connectedBackend(userId)
    if (!connected?.status.capabilities.read) return null

    const spec: MailQuerySpec = { keywordGroups: [], newerThanDays: options.windowDays }
    const outcome = await connected.backend.search(userId, spec, options.limit)
    return {
      provider: connected.status.provider ?? 'google',
      messages: outcome.messages,
      ownAddress: connected.status.address,
    }
  }

  /**
   * #4016 L3 — le CORPS d'un fil de la boîte de CET utilisateur, pour Laura, à lui
   * seul (`c96_corps_mails_boite_du_commercial`). Le jeton lu est celui de
   * `userId` : jamais la boîte d'un collègue. `null` = fil introuvable dans la
   * fenêtre (jamais un fil « vide »). Aucun corps n'est journalisé, mis en cache
   * ni écrit : il traverse cette méthode et c'est tout.
   */
  async readOwnThread(
    userId: string,
    input: { threadId: string; counterpart?: string; windowDays?: number },
    scope: MailboxReadScope = {},
  ): Promise<MailThreadText | null> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) return demoMailThreadText(input.threadId)
    const connected = await this.connectedBackend(userId, scope)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.read) {
      throw this.missingCapability(
        connected.status,
        'read',
        'La messagerie connectée ne donne pas accès à la lecture. Reconnecte-la pour activer cette fonction.',
      )
    }
    // #4405.1 — par IDENTIFIANT quand le fournisseur sait lire un fil : la recherche des derniers messages
    // ne voit pas un fil ancien ou noyé. La raison réelle d'un échec est journalisée (jamais un contenu).
    if (connected.backend.readThreadBodies) {
      try {
        const thread = await connected.backend.readThreadBodies(userId, input.threadId)
        if (!thread) return null
        const kept: MailThreadTextMessage[] = []
        for (const message of thread.messages) {
          const { text } = normalizeMailBody({
            plain: message.plain,
            html: message.html,
            maxLength: MAIL_THREAD_MAX_CHARS,
          })
          if (text !== null) kept.push({ direction: message.direction, date: message.date, from: message.from, text })
        }
        if (kept.length === 0) return null
        const messages = kept.slice(-MAIL_THREAD_MAX_MESSAGES)
        return { threadId: input.threadId, subject: thread.subject, messages, truncated: kept.length > messages.length }
      } catch (error) {
        this.logger.warn(
          `Lecture du fil impossible (${connected.status.provider ?? 'google'}): ${failureReason(error)}`,
        )
        throw error
      }
    }
    const spec: MailQuerySpec = {
      keywordGroups: [],
      newerThanDays: input.windowDays ?? MAIL_THREAD_DEFAULT_WINDOW_DAYS,
      ...(input.counterpart?.trim() ? { participant: input.counterpart.trim().replace(/^@+/, '') } : {}),
    }
    const outcome = await connected.backend.search(userId, spec, MAIL_THREAD_SEARCH_LIMIT)
    const { picked, truncated } = pickThreadMessages(outcome.messages, input.threadId)
    if (picked.length === 0) {
      this.logger.warn(`Lecture du fil: aucun message du fil dans ${outcome.messages.length} messages recherchés`)
      return null
    }
    const messages: MailThreadTextMessage[] = []
    let firstFailure: string | null = null
    for (const message of picked) {
      try {
        const body = await connected.backend.fetchBody(userId, message.id)
        const { text } = normalizeMailBody({ plain: body.plain, html: body.html, maxLength: MAIL_THREAD_MAX_CHARS })
        if (text === null) continue
        messages.push({ direction: message.direction, date: message.date, from: message.from, text })
      } catch (error) {
        firstFailure ??= failureReason(error)
        this.logger.warn(`Lecture d'un message de fil impossible: ${failureReason(error)}`)
      }
    }
    if (messages.length === 0) {
      this.logger.warn(
        `Lecture du fil: aucun contenu lisible sur ${picked.length} messages (${firstFailure ?? 'contenu vide'})`,
      )
      return null
    }
    return { threadId: input.threadId, subject: picked[0]?.subject ?? null, messages, truncated }
  }

  /**
   * Le corps intégral d'un message. Réservé à la capture d'activités
   * (arbitrage Louis du 16/08) : nulle part ailleurs le produit ne descend
   * jusqu'au texte écrit par un humain.
   */
  async fetchBody(userId: string, messageId: string): Promise<{ plain: string | null; html: string | null }> {
    const connected = await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    return connected.backend.fetchBody(userId, messageId)
  }

  /**
   * Rattache chaque fil affiché à son compte (MAIL-01).
   *
   * Best-effort intégral : une lecture de contacts en échec laisse simplement
   * `account: null` sur chaque fil. Le contexte est un CONFORT — une recherche
   * de messagerie qui tomberait parce que la table contacts est lente serait un
   * très mauvais échange.
   *
   * La lecture est scopée à l'espace de travail actif, comme toute lecture
   * d'équipe : rattacher un fil au compte d'un autre espace serait une fuite.
   */
  private async withAccountContext(userId: string, threads: MailThread[]): Promise<MailThread[]> {
    if (threads.length === 0) return threads
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const rows = await this.contacts
        .createQueryBuilder('c')
        // #1473 — INNER, et c'est VOULU : cet index sert à rattacher un fil de
        // messagerie à un COMPTE. Un contact à qualifier n'en a pas, donc il
        // n'a rien à y apporter. Le fil reste visible, simplement sans compte.
        .innerJoin('accounts', 'a', 'a.id = c.account_id')
        .select('c.id', 'contactId')
        .addSelect('c.email', 'email')
        .addSelect('a.id', 'accountId')
        .addSelect('a.company_name', 'accountName')
        // #5003 — l'étiquette « ESN » du compte rattaché (jamais un filtre).
        .addSelect('a.is_intermediary', 'accountIsEsn')
        .where('c.workspace_id = :workspaceId AND c.email IS NOT NULL AND c.deleted_at IS NULL', { workspaceId })
        .getRawMany<ContactAnchor>()

      const index = buildThreadAccountIndex(rows)
      return threads.map(thread => {
        const link = linkThreadToAccount(thread, index)
        // #2104.3 — la fiche contact voyage À CÔTÉ du compte, jamais à sa
        // place : un rattachement par domaine a un compte mais pas de contact
        // précis (voir `toContactRef`).
        return { ...thread, account: toAccountRef(link), contactId: toContactRef(link) }
      })
    } catch (error) {
      this.logger.warn(`Mailbox account context skipped: ${(error as Error).message}`)
      return threads
    }
  }

  /**
   * #2381.1/.3/.4/.5/.6 (LAU-FINAL-095) — une réponse ENTRANTE classe et
   * tire sa conséquence DÉTERMINISTE (`outreachReplyEffect`, contrat pur) sur
   * les séquences VIVANTES de son contact.
   *
   * `thread.contactId` — jamais `thread.account` — porte la décision d'agir :
   * il n'est posé QUE sur une adresse EXACTE (#2381.3, `thread-account-link.ts`),
   * jamais sur un domaine partagé. Un fil dont l'adresse ne correspond à aucun
   * contact du portefeuille reste NON RÉSOLU — « à rapprocher » — et cette
   * fonction n'y touche pas : se tromper de contact arrêterait la séquence de
   * quelqu'un d'autre.
   */
  private async reconcileReplySequences(userId: string, threads: readonly MailThread[]): Promise<void> {
    for (const thread of threads) {
      const cls = classifyThread(thread)
      if (!cls) continue
      // #3234 — l'identifiant de fil rendu par le fournisseur À L'ENVOI gagne sur
      // l'heuristique d'adresse ; sans envoi connu pour ce fil, on retombe sur
      // `thread.contactId` (adresse EXACTE, #2381.3), inchangé.
      const contactId = (await this.contactOfSentThread(userId, thread.threadId)) ?? thread.contactId
      if (!contactId) continue
      const effect = outreachReplyEffect(cls)
      if (effect.action === 'pause') {
        await this.pauseSequencesForContact(userId, contactId, effect.event)
      } else {
        await this.onReplyReceived(userId, contactId, {
          channel: 'email',
          event: effect.event,
          createsQualification: effect.createsQualification,
          accountId: thread.account?.id ?? null,
        })
      }
    }
  }

  /**
   * #4181 — LE POINT D'ENTRÉE UNIQUE d'une réponse reçue (mail ou LinkedIn) :
   * une réponse arrête les séquences du contact, rend caduques ses tâches de
   * relance ouvertes (avec la raison) et retire les brouillons « sans réponse »
   * déjà préparés. Un appelant n'appelle que celui-ci — jamais les trois gestes
   * un par un.
   *
   * Les trois gestes sont indépendants : l'échec de l'un ne prive pas les deux
   * autres. La première erreur est relevée APRÈS les trois.
   */
  async onReplyReceived(
    userId: string,
    contactId: string,
    input: {
      channel: 'email' | 'linkedin'
      event: OutreachSequenceStopEvent
      accountId: string | null
      createsQualification?: boolean
    },
  ): Promise<void> {
    const failures: unknown[] = []
    const steps: (() => Promise<void>)[] = [
      () =>
        this.stopSequencesForContact(
          userId,
          contactId,
          input.event,
          input.createsQualification ?? false,
          input.accountId,
        ),
      () => this.closeFollowUpTasks(userId, contactId, input.channel),
      () => this.retractFollowUpDrafts(userId, contactId),
    ]
    for (const step of steps) {
      try {
        await step()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) throw failures[0]
  }

  /**
   * #4181.2 — les tâches de RELANCE de cadence (`relance`, `preuve_sociale`,
   * `close_loop`) encore ouvertes pour ce contact passent `obsolete` : marquées,
   * jamais supprimées (« on archive, on ne supprime pas »), avec la raison en
   * tête de `reason` (l'ancienne raison suit). Le premier contact (`initial`) et
   * les tâches déjà faites ne sont pas visés. Raw SQL : `mailbox` est autonome.
   */
  private async closeFollowUpTasks(userId: string, contactId: string, channel: 'email' | 'linkedin'): Promise<void> {
    const via = channel === 'linkedin' ? 'LinkedIn' : 'mail'
    const day = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
    const reason = `Réponse reçue par ${via} le ${day} : la relance n’a plus lieu d’être.`
    await this.contacts.query(
      `UPDATE action_plan_items
          SET execution_status = 'obsolete', done = false, completed_at = NULL, snoozed_until = NULL,
              reason = $3 || COALESCE(' · ' || reason, '')
        WHERE contact_id = $1
          AND (user_id = $2 OR assigned_to = $2)
          AND cadence_step IN ('relance', 'preuve_sociale', 'close_loop')
          AND execution_status IN ('todo', 'prepared', 'snoozed')`,
      [contactId, userId, reason],
    )
  }

  /**
   * #4181.3 — consigne un brouillon de relance « sans réponse » que la routine
   * vient de préparer : sans cette trace, une réponse arrivée ensuite ne saurait
   * pas quel brouillon retirer. Même table que l'idempotence des brouillons
   * (`action_dispatch_attempts`), la clé porte le contact.
   */
  async recordFollowUpDraft(userId: string, contactId: string, draftId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (!workspaceId) return
    await this.contacts.query(
      `INSERT INTO action_dispatch_attempts (workspace_id, idempotency_key, intent_type, user_id, status, external_ref, completed_at)
       VALUES ($1, $2, '${FOLLOW_UP_DRAFT_INTENT}', $3, 'done', $4, now())
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
      [workspaceId, `no_reply_draft:${contactId}:${draftId}`, userId, draftId],
    )
  }

  /**
   * #4181.3 — retire les brouillons de relance « sans réponse » encore
   * consignés pour ce contact, puis les marque annulés. Un brouillon que le
   * fournisseur refuse de supprimer reste consigné (`done`) : la prochaine
   * réponse ou un passage ultérieur retentera, rien n'est déclaré retiré à tort.
   */
  private async retractFollowUpDrafts(userId: string, contactId: string): Promise<void> {
    const rows = await this.contacts.query<{ id: string; external_ref: string | null }[]>(
      `SELECT id, external_ref FROM action_dispatch_attempts
        WHERE user_id = $1 AND intent_type = '${FOLLOW_UP_DRAFT_INTENT}' AND status = 'done'
          AND idempotency_key LIKE $2`,
      [userId, `no_reply_draft:${contactId}:%`],
    )
    for (const row of rows ?? []) {
      if (!row.external_ref) continue
      try {
        await this.deleteDraft(userId, row.external_ref)
      } catch (error) {
        this.logger.warn(`Follow-up draft not retracted: ${(error as Error).message}`)
        continue
      }
      await this.contacts.query(
        `UPDATE action_dispatch_attempts SET status = 'cancelled', reason = 'reply_received', completed_at = now()
          WHERE id = $1`,
        [row.id],
      )
    }
  }

  /**
   * #4016 L13c (DÉCISION LOUIS 11/10/2026) — « ENVOYÉ » DÉTECTÉ DANS LA BOÎTE.
   *
   * Un message SORTANT de la boîte de l'utilisateur vers un contact résolu avec
   * certitude complète les actions du plan encore OUVERTES qui visent ce contact
   * pour le joindre — `completion_mode: 'proof'`, la même preuve que l'envoi
   * Bellum vérifié (`CadenceService.completeOpenItemsByProof`), jamais `manual` :
   * « Fait » reste un geste déclaratif, il ne porte JAMAIS de preuve d'envoi.
   *
   * Bornes : l'action doit exister AVANT l'envoi (`created_at <= date d'envoi` —
   * un mail parti avant ne solde pas une action créée après), seule la prise de
   * contact (`target_kind = 'contact'`) est concernée (#2396.11), et seulement
   * les actions de l'utilisateur lui-même. Raw SQL volontaire : `mailbox` est un
   * module AUTONOME (règle #7), comme pour les séquences ci-dessus. Métadonnées
   * seulement (direction, date) : jamais le corps.
   */
  private async reconcileSentProofs(
    userId: string,
    threads: readonly MailThread[],
    messages: readonly MailMessage[],
  ): Promise<void> {
    for (const proof of latestSentProofByThread(threads, messages)) {
      await this.contacts.query(
        `UPDATE action_plan_items
            SET execution_status = 'done', done = true, completed_at = now(),
                completion_mode = 'proof', outcome = NULL
          WHERE contact_id = $1
            AND (user_id = $2 OR assigned_to = $2)
            AND target_kind = 'contact'
            AND execution_status IN ('todo', 'prepared')
            AND created_at <= $3`,
        [proof.contactId, userId, proof.sentAt],
      )
      // #4179.2 — le même message sortant, lu dans la boîte, est aussi la seule
      // preuve que « éléments envoyés » contient bien l'envoi. Seul un envoi PAR
      // la boîte du commercial est concerné (jamais l'envoi de l'espace), et le
      // message doit suivre la tentative : un mail plus ancien ne la prouve pas.
      await this.contacts.query(
        `UPDATE contacts
            SET email_sent_observed_at = $2
          WHERE id = $1
            AND email_send_channel = 'mailbox'
            AND email_sent_observed_at IS NULL
            AND email_send_attempted_at IS NOT NULL
            AND email_send_attempted_at <= $2`,
        [proof.contactId, proof.sentAt],
      )
    }
  }

  /**
   * #3718.6 — les utilisateurs dont au moins une séquence est vivante : les
   * seuls pour qui une réponse non lue peut encore déclencher une relance.
   */
  async usersWithLiveSequences(limit = 200): Promise<string[]> {
    const rows = await this.contacts.query<{ user_id: string }[]>(
      `SELECT DISTINCT user_id FROM outreach_sequences WHERE status IN ('active', 'paused') AND user_id IS NOT NULL LIMIT $1`,
      [limit],
    )
    return (rows ?? []).map(row => row.user_id)
  }

  /**
   * #3718.6 — lit, pour CHAQUE contact à séquence vivante de l'utilisateur, les
   * derniers échanges avec son adresse EXACTE ; `search` réconcilie au passage
   * (une réponse arrête ou met en pause la séquence — même chemin, même journal,
   * `reconcileReplySequences`). Sans cela, la détection ne partait qu'à
   * l'ouverture de la messagerie : une réponse restait « inconnue » des relances
   * tant que personne n'avait ouvert la boîte.
   *
   * Sujet et extrait seulement (jamais le corps), boîte de L'UTILISATEUR
   * lui-même. Une boîte non branchée ou en panne se saute — ni arrêt, ni
   * relance inventée. Rend le nombre d'adresses effectivement relues.
   */
  async reconcileLiveSequenceReplies(userId: string, maxContacts = 25): Promise<number> {
    const sequences = await this.contacts.query<{ contact_id: string }[]>(
      `SELECT DISTINCT contact_id FROM outreach_sequences
        WHERE user_id = $1 AND status IN ('active', 'paused') AND contact_id IS NOT NULL
        LIMIT $2`,
      [userId, maxContacts],
    )
    const contactIds = (sequences ?? []).map(row => row.contact_id)
    const rows =
      contactIds.length === 0
        ? []
        : (await this.contacts.find({ where: { id: In(contactIds), deleted_at: IsNull() }, select: ['id', 'email'] }))
            .filter(contact => !!contact.email)
            .map(contact => ({ email: contact.email as string }))
    let read = 0
    for (const row of rows ?? []) {
      try {
        await this.search(
          userId,
          mailSearchRequestSchema.parse({ intent: 'free', counterpart: row.email, windowDays: 14, limit: 5 }),
        )
        read += 1
      } catch (error) {
        this.logger.warn(`Reply sweep skipped for one address: ${(error as Error).message}`)
        // Messagerie absente ou en panne : inutile d'insister adresse par adresse.
        break
      }
    }
    return read
  }

  /**
   * #4016.13e — les utilisateurs qui ont au moins une action de prise de contact
   * OUVERTE : les seuls pour qui un « Envoyé » détecté peut encore solder quelque
   * chose. Raw SQL : `mailbox` reste un module autonome (règle n°7).
   */
  async usersWithOpenContactActions(limit = 200): Promise<string[]> {
    const rows = await this.contacts.query<{ user_id: string }[]>(
      `SELECT DISTINCT COALESCE(assigned_to, user_id) AS user_id FROM action_plan_items
        WHERE target_kind = 'contact' AND contact_id IS NOT NULL
          AND execution_status IN ('todo', 'prepared') AND COALESCE(assigned_to, user_id) IS NOT NULL
        LIMIT $1`,
      [limit],
    )
    return (rows ?? []).map(row => row.user_id)
  }

  /**
   * #4016.13e — le balayage dédié du « Envoyé » détecté : pour CHAQUE contact à
   * action de prise de contact ouverte de l'utilisateur, relit les derniers
   * échanges avec son adresse EXACTE ; `search` réconcilie au passage la preuve
   * (`reconcileSentProofs`, `completion_mode = 'proof'`). Sans lui, la preuve ne
   * partait qu'à l'ouverture de la messagerie. Boîte de L'UTILISATEUR seulement,
   * métadonnées seulement (jamais le corps). Une boîte absente ou en panne se
   * saute. Rend le nombre d'adresses effectivement relues.
   */
  async reconcileOpenActionSentProofs(userId: string, maxContacts = 25): Promise<number> {
    const open = await this.contacts.query<{ contact_id: string }[]>(
      `SELECT DISTINCT contact_id FROM action_plan_items
        WHERE (user_id = $1 OR assigned_to = $1) AND target_kind = 'contact' AND contact_id IS NOT NULL
          AND execution_status IN ('todo', 'prepared')
        LIMIT $2`,
      [userId, maxContacts],
    )
    const contactIds = (open ?? []).map(row => row.contact_id)
    if (contactIds.length === 0) return 0
    const rows = (
      await this.contacts.find({ where: { id: In(contactIds), deleted_at: IsNull() }, select: ['id', 'email'] })
    )
      .filter(contact => !!contact.email)
      .map(contact => ({ email: contact.email as string }))
    let read = 0
    for (const row of rows) {
      try {
        await this.search(
          userId,
          mailSearchRequestSchema.parse({ intent: 'free', counterpart: row.email, windowDays: 14, limit: 5 }),
        )
        read += 1
      } catch (error) {
        this.logger.warn(`Sent-proof sweep skipped for one address: ${(error as Error).message}`)
        break
      }
    }
    return read
  }

  /**
   * #3234 — le contact auquel CE fil a été envoyé, d'après l'identifiant de fil
   * que le fournisseur a rendu à l'envoi (`outreach_messages.provider_thread_id`).
   * `null` : aucun envoi connu (autre fournisseur, envoi antérieur à la colonne,
   * fil non envoyé par l'app) — jamais une devinette. Raw SQL : `mailbox` reste
   * un module autonome (règle n°7).
   */
  private async contactOfSentThread(userId: string, threadId: string): Promise<string | null> {
    const rows = await this.contacts.query<{ contact_id: string | null }[]>(
      `SELECT contact_id FROM outreach_messages
        WHERE user_id = $1 AND provider_thread_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [userId, threadId],
    )
    return rows?.[0]?.contact_id ?? null
  }

  /**
   * ARRÊTE (jamais une simple pause) les séquences vivantes de ce contact —
   * même geste, même journal que `ContactsService.updateStatus` (#2381.1) :
   * raw SQL + CTE (capture l'état PRÉCÉDENT en une requête), `outreach_transitions`
   * (subject_kind='sequence'), pas un second moteur. Raw SQL volontaire :
   * `mailbox` est un module AUTONOME (règle #7) et `ActionRouterModule`
   * importe déjà `MailboxModule` — l'importer en retour créerait un cycle réel.
   *
   * #2381.6 — une classe `positive` crée AUSSI une action de qualification
   * (`user_actions`, `action_type: 'plan_action_added'` — le même vocabulaire
   * que le rappel interne de `ActionRouterService.dispatchReminder`, pas un
   * nouveau) : jamais une étape de séquence de plus « pour être sûr ».
   */
  private async stopSequencesForContact(
    userId: string,
    contactId: string,
    event: OutreachSequenceStopEvent,
    createsQualification: boolean,
    accountId: string | null,
  ): Promise<void> {
    const stopped = await this.contacts.query<{ id: string; workspace_id: string | null; previous_status: string }[]>(
      `WITH previous AS (
         SELECT id, workspace_id, status FROM outreach_sequences
          WHERE contact_id = $1 AND user_id = $2 AND status IN ('active', 'paused')
       ), updated AS (
         UPDATE outreach_sequences s SET status = 'cancelled'
           FROM previous WHERE s.id = previous.id
       )
       SELECT id, workspace_id, status AS previous_status FROM previous`,
      [contactId, userId],
    )
    if (stopped.length === 0) return
    const ids = stopped.map(row => row.id)
    await this.contacts.query(
      `UPDATE outreach_sequence_steps SET status = 'skipped'
        WHERE sequence_id = ANY($1::uuid[]) AND status = 'pending'`,
      [ids],
    )
    for (const row of stopped) {
      await this.contacts.query(
        `INSERT INTO outreach_transitions
           (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
         VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'system', $5, 'applied')`,
        [row.workspace_id, userId, row.id, row.previous_status, event],
      )
      // #2875/#2402.3 (lot V11) — `reponse_positive` au registre canonique,
      // sur la MÊME séquence RÉELLEMENT arrêtée ci-dessus (jamais sur
      // `pause`/un autre motif d'arrêt) — best-effort, hors du chemin
      // critique de la réconciliation.
      if (event === 'reply_positive' && row.workspace_id) {
        try {
          const now = new Date()
          const trigger = buildTriggerEvent({
            type: 'reponse_positive',
            source: 'mailbox',
            subjectType: 'contact',
            subjectId: contactId,
            workspaceId: row.workspace_id,
            ownerId: userId,
            evidence: 'Réponse classée positive — séquence arrêtée, qualification créée.',
            confidence: 'mesuree',
            now,
            // #2875 — une ligne par jour et par contact (réponses rejouées).
            dedupeQualifier: triggerPeriodQualifier(now, 'day'),
          })
          void this.triggers?.recordOnceByDedupeKey(trigger, 'mailbox/mailbox.service')
        } catch (error) {
          this.logger.error('Événement canonique « reponse_positive » en échec', { error })
        }
      }
    }
    if (!createsQualification) return
    const workspaceId = stopped[0]?.workspace_id ?? null
    await this.contacts.query(
      `INSERT INTO user_actions (user_id, workspace_id, account_id, contact_id, action_type, channel, metadata)
       VALUES ($1, $2, $3, $4, 'plan_action_added', NULL, $5::jsonb)`,
      [
        userId,
        workspaceId,
        accountId,
        contactId,
        JSON.stringify({
          label: 'Qualifier la réponse positive',
          detail: 'Une réponse positive a été détectée — qualifier avant de poursuivre.',
          status: 'Programmé',
          router_intent: 'schedule_reminder',
          source: 'internal_reminder',
          reply_class: 'positive',
        }),
      ],
    )
  }

  /**
   * MET EN PAUSE (jamais un arrêt) les séquences ACTIVES de ce contact —
   * #2381.2/.5 : reprise seulement par geste humain explicite (`resume()`,
   * déjà là #2381.8). Même patron que `stopSequencesForContact` ci-dessus.
   */
  private async pauseSequencesForContact(
    userId: string,
    contactId: string,
    event: OutreachSequencePauseEvent,
  ): Promise<void> {
    const paused = await this.contacts.query<{ id: string; workspace_id: string | null; previous_status: string }[]>(
      `WITH previous AS (
         SELECT id, workspace_id, status FROM outreach_sequences
          WHERE contact_id = $1 AND user_id = $2 AND status = 'active'
       ), updated AS (
         UPDATE outreach_sequences s SET status = 'paused'
           FROM previous WHERE s.id = previous.id
       )
       SELECT id, workspace_id, status AS previous_status FROM previous`,
      [contactId, userId],
    )
    for (const row of paused) {
      await this.contacts.query(
        `INSERT INTO outreach_transitions
           (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
         VALUES ($1, $2, 'sequence', $3, $4, 'paused', $2, 'system', $5, 'applied')`,
        [row.workspace_id, userId, row.id, row.previous_status, event],
      )
    }
  }

  /** Le tri final dépend de l'intention — c'est là qu'une recherche devient une réponse. */
  private selectThreads(
    request: MailSearchRequest,
    threads: MailThread[],
    messages: Parameters<typeof selectPositiveReplies>[1],
  ): MailThread[] {
    switch (request.intent) {
      case 'no_reply':
        return selectAwaitingReply(threads, request.silenceDays)
      case 'unread':
        return threads.filter(thread => thread.unread)
      case 'positive_reply':
        return selectPositiveReplies(threads, messages)
      case 'attachments':
        return threads.filter(thread => thread.hasAttachments)
      default:
        return threads
    }
  }

  /**
   * UN LOT — déposé en brouillons, ou envoyé après approbation.
   *
   * Arbitrage Louis du 03/08 : un lot validé peut partir. C'est la décision la
   * plus risquée du chantier, donc elle vient avec quatre garde-fous, appliqués
   * dans cet ordre :
   *
   * 1. **Idempotence d'abord.** Le lot est enregistré AVANT le premier envoi.
   *    Ré-approuver, recharger la page ou rejouer la requête retrouve le lot
   *    déjà traité et ne renvoie rien. Rater un lot se répare ; un lot parti
   *    deux fois, non.
   * 2. **Déduplication.** Deux fois la même adresse dans un lot, c'est deux
   *    messages chez la même personne — on écarte, et on le dit.
   * 3. **Opt-out destinataire par destinataire.** Un désabonné est écarté avec
   *    sa raison, jamais silencieusement inclus.
   * 4. **Arrêt sur échecs consécutifs.** Trois refus d'affilée signalent presque
   *    toujours un problème de compte (quota, jeton, blocage) et non trois
   *    adresses malchanceuses. Le reste du lot est écarté plutôt que de
   *    transformer un incident en réputation d'expéditeur abîmée.
   */
  async sendBatch(userId: string, input: MailBatchRequest): Promise<MailBatchResult> {
    const request = mailBatchRequestSchema.parse(input)

    const already = await this.batches.findOne({ where: { batch_id: request.batchId } })
    if (already) {
      // Rien n'est refait. On rend ce que le lot avait produit.
      return {
        batchId: request.batchId,
        mode: already.mode,
        alreadyProcessed: true,
        sent: already.sent,
        drafted: already.drafted,
        skipped: already.skipped,
        failed: already.failed,
        aborted: already.aborted,
        outcomes: [],
      }
    }

    const needed: MailboxCapability = request.mode === 'send' ? 'send' : 'draft'
    // #4546.5 — l'expéditeur DÉSIGNÉ parmi SES boîtes, vérifié AVANT de réserver le lot : une boîte qui n'est pas la
    // sienne ou sans la portée demandée est refusée, rien ne part, le lot reste rejouable.
    const chosen = request.senderConnectionId
      ? await this.resolveSender(userId, request.senderConnectionId, needed)
      : null
    const connected = chosen ? { backend: chosen.backend, status: chosen.status } : await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    const capability = connected.status.capabilities[needed]
    if (!capability) {
      throw this.missingCapability(
        connected.status,
        needed,
        request.mode === 'send'
          ? "La messagerie connectée n'autorise pas l'envoi. Reconnecte-la pour activer cette fonction."
          : "La messagerie connectée n'autorise pas la création de brouillons. Reconnecte-la pour activer cette fonction.",
      )
    }

    // Réserver le lot AVANT d'envoyer quoi que ce soit.
    try {
      await this.batches.insert({
        user_id: userId,
        batch_id: request.batchId,
        mode: request.mode,
        requested: request.items.length,
      })
    } catch {
      // Une autre requête a pris ce lot entre-temps : on ne le rejoue pas.
      return {
        batchId: request.batchId,
        mode: request.mode,
        alreadyProcessed: true,
        sent: 0,
        drafted: 0,
        skipped: 0,
        failed: 0,
        aborted: false,
        outcomes: [],
      }
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const signature = await this.resolveSignature(userId, connected.backend)

    const outcomes: MailBatchOutcome[] = []
    const seen = new Set<string>()
    let consecutiveFailures = 0
    let aborted = false

    for (const item of request.items) {
      const address = item.to.trim().toLowerCase()

      if (aborted) {
        outcomes.push({ to: item.to, status: 'skipped', reason: 'aborted_after_failures', error: null })
        continue
      }
      if (seen.has(address)) {
        outcomes.push({ to: item.to, status: 'skipped', reason: 'duplicate', error: null })
        continue
      }
      seen.add(address)

      if (workspaceId && (await this.suppression.isSuppressed(workspaceId, item.to))) {
        outcomes.push({ to: item.to, status: 'skipped', reason: 'suppressed', error: null })
        continue
      }

      try {
        await connected.backend.createDraft(
          userId,
          {
            to: item.to,
            cc: [],
            subject: item.subject,
            body: item.body,
            appendSignature: true,
            // Un lot ne porte pas de pièce jointe : chaque destinataire aurait
            // le même document, et une relance de masse n'est pas un envoi de CV.
            documentIds: [],
            ...(item.threadId ? { threadId: item.threadId } : {}),
          },
          signature,
          request.senderConnectionId,
        )
        // Le mode `send` dépose le brouillon PUIS l'envoie : un envoi qui échoue
        // laisse ainsi un brouillon récupérable plutôt qu'un message perdu.
        const receipt =
          request.mode === 'send'
            ? await this.sendPrepared(userId, item, connected.backend, request.senderConnectionId)
            : null
        outcomes.push({
          to: item.to,
          status: request.mode === 'send' ? 'sent' : 'drafted',
          reason: null,
          error: null,
          // #3234 — les identifiants du fournisseur, jamais le corps.
          ...(receipt ? { providerMessageId: receipt.messageId, providerThreadId: receipt.threadId } : {}),
        })
        consecutiveFailures = 0
      } catch (error) {
        const message = (error as Error).message
        outcomes.push({ to: item.to, status: 'failed', reason: null, error: message })
        consecutiveFailures += 1
        if (consecutiveFailures >= BATCH_ABORT_AFTER_FAILURES) {
          this.logger.warn(`Mail batch aborted after ${consecutiveFailures} consecutive failures`, {
            user: { id: userId },
          })
          aborted = true
        }
      }
    }

    const tally = {
      sent: outcomes.filter(outcome => outcome.status === 'sent').length,
      drafted: outcomes.filter(outcome => outcome.status === 'drafted').length,
      skipped: outcomes.filter(outcome => outcome.status === 'skipped').length,
      failed: outcomes.filter(outcome => outcome.status === 'failed').length,
    }
    await this.batches.update({ batch_id: request.batchId }, { ...tally, aborted })

    return { batchId: request.batchId, mode: request.mode, alreadyProcessed: false, ...tally, aborted, outcomes }
  }

  /**
   * #4546.5 — toutes SES boîtes, tous fournisseurs confondus : la liste parmi laquelle l'expéditeur se choisit. Un
   * fournisseur en panne ne masque pas l'autre. Ne rend jamais la boîte d'un collègue (chaque backend lit par
   * `user_id`).
   */
  async listSenders(userId: string): Promise<MailboxSender[]> {
    const all: MailboxSender[] = []
    for (const backend of this.backends) {
      try {
        all.push(...(await backend.senders(userId)))
      } catch (error) {
        this.logger.warn(`Mailbox senders probe failed: ${(error as Error).message}`)
      }
    }
    return all
  }

  /** La boîte désignée, si elle est à lui ET porte la capacité demandée ; sinon on refuse en nommant pourquoi. */
  private async resolveSender(
    userId: string,
    connectionId: string,
    needed: MailboxCapability,
  ): Promise<{ backend: MailboxBackend; status: Omit<MailboxStatus, 'connectedCount'> } | null> {
    for (const backend of this.backends) {
      const sender = (await backend.senders(userId)).find(candidate => candidate.connectionId === connectionId)
      if (!sender) continue
      const hasCapability = needed === 'send' ? sender.capabilities.send : sender.capabilities.draft
      if (!hasCapability) {
        throw new BadRequestException(
          needed === 'send'
            ? "Cette boîte n'autorise pas l'envoi. Reconnecte-la pour activer cette fonction."
            : "Cette boîte n'autorise pas la création de brouillons. Reconnecte-la pour activer cette fonction.",
        )
      }
      return {
        backend,
        status: {
          connected: true,
          provider: sender.provider,
          address: sender.address,
          capabilities: {
            read: sender.capabilities.read,
            draft: sender.capabilities.draft,
            send: sender.capabilities.send,
            labels: false,
            outOfOffice: false,
          },
        },
      }
    }
    throw new NotFoundException("Cette boîte n'est pas l'une des tiennes.")
  }

  /**
   * L'envoi réel d'un message du lot.
   *
   * Isolé pour une raison : c'est le seul endroit du service qui fait partir
   * quelque chose chez quelqu'un. Il passe par le backend connecté, dont le
   * chemin d'envoi applique déjà le contrôle d'opt-out — la ceinture par-dessus
   * la bretelle posée plus haut.
   */
  private async sendPrepared(
    userId: string,
    item: { to: string; subject: string; body: string },
    backend: MailboxBackend,
    connectionId?: string,
  ): Promise<MailSendReceipt> {
    const receipt = await backend.send(userId, item, connectionId)
    // Un backend antérieur au reçu rend `undefined` : pas d'identifiant, pas d'invention.
    return { messageId: receipt?.messageId ?? null, threadId: receipt?.threadId ?? null }
  }

  /**
   * #3699.4 — ce que la boîte connectée sait faire POUR UN ENVOI INDIVIDUEL, dit
   * tel quel : connectée ou non, quelle adresse, et si le droit d'envoi est
   * accordé ICI ET MAINTENANT. Une boîte connectée sans le droit d'envoi n'est
   * pas « absente » : l'écran doit pouvoir le dire (portée à reconnecter) au
   * lieu de se rabattre en silence sur l'adresse de l'espace.
   */
  async individualSendStatus(
    userId: string,
    /** #4546.5 — la boîte désignée ; absent = la boîte par défaut d'avant. */
    senderConnectionId?: string,
  ): Promise<{
    connected: boolean
    provider: MailboxStatus['provider']
    address: string | null
    can_send: boolean
  }> {
    if (senderConnectionId) {
      // #4546.5 — la boîte désignée se lit parmi SES boîtes : une boîte qui n'est pas à lui n'est « pas connectée »
      // pour lui, jamais l'adresse d'un autre.
      const sender = (await this.listSenders(userId)).find(candidate => candidate.connectionId === senderConnectionId)
      if (!sender) return { connected: false, provider: null, address: null, can_send: false }
      return { connected: true, provider: sender.provider, address: sender.address, can_send: sender.capabilities.send }
    }
    const status = await this.status(userId)
    return {
      connected: status.connected,
      provider: status.provider,
      address: status.address,
      can_send: status.connected && status.capabilities.send,
    }
  }

  /**
   * #3699.4 — l'envoi INDIVIDUEL depuis la boîte connectée : le même chemin
   * d'envoi que le lot (`backend.send`, qui porte déjà l'opt-out et le jeton),
   * jamais un second moteur. Refuse net (sans basculer ailleurs) quand la boîte
   * n'est pas prête — l'appelant en tire un `mailbox_unavailable` explicite.
   */
  async sendIndividual(
    userId: string,
    item: { to: string; subject: string; body: string; attachments?: readonly OutgoingMailAttachment[] },
    /** #4546.5 — la boîte désignée parmi SES boîtes ; absent = la boîte par défaut d'avant. */
    senderConnectionId?: string,
  ): Promise<void> {
    const connected = senderConnectionId
      ? await this.resolveSender(userId, senderConnectionId, 'send')
      : await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.send) {
      throw this.missingCapability(
        connected.status,
        'send',
        "La messagerie connectée n'autorise pas l'envoi. Reconnecte-la pour activer cette fonction.",
      )
    }
    if (senderConnectionId) await connected.backend.send(userId, item, senderConnectionId)
    else await connected.backend.send(userId, item)
  }

  async listAttachments(userId: string, messageId: string): Promise<MailAttachment[]> {
    const connected = await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    return connected.backend.listAttachments(userId, messageId)
  }

  /**
   * Le CONTENU d'une pièce jointe (#2568.1 — importer un CV depuis sa
   * messagerie). L'identifiant vient toujours de {@link listAttachments} : on
   * ne devine jamais un `attachmentId`.
   *
   * « Pas connecté » lève la même erreur NOMMÉE que les cinq autres portes
   * (`not_connected` / `scope_missing`) — pas de traitement à part pour celle-
   * ci. `null` reste réservé à un état différent : la pièce jointe elle-même
   * est devenue introuvable (message supprimé entre-temps, etc.).
   */
  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ filename: string; mimeType: string | null; dataB64: string; messageDate: string | null } | null> {
    const connected = await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    return connected.backend.getAttachment(userId, messageId, attachmentId)
  }

  /**
   * Déposer un brouillon RÉEL dans la boîte de l'utilisateur.
   *
   * Deux verrous avant l'appel réseau, dans cet ordre : le destinataire ne doit
   * pas s'être désabonné (même règle que le mailer sortant #394 — un opt-out ne
   * se contourne pas parce que le message part d'une autre boîte), et la
   * signature apposée doit être une signature RÉELLE, lue quelque part, jamais
   * fabriquée.
   */
  async createDraft(
    userId: string,
    request: MailDraftRequest,
    /** #4546.5 — la boîte désignée parmi SES boîtes ; absent = la boîte par défaut d'avant. */
    senderConnectionId?: string,
  ): Promise<MailDraftResult> {
    // Salle de démonstration : le bouton existe, donc il doit répondre. Rien
    // n'est déposé, rien n'est envoyé, aucun fournisseur n'est appelé.
    if (await this.workspaceContext.isDemoWorkspace(userId)) return demoMailDraft()
    const connected = senderConnectionId
      ? await this.resolveSender(userId, senderConnectionId, 'draft')
      : await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.draft) {
      throw this.missingCapability(
        connected.status,
        'draft',
        "La messagerie connectée n'autorise pas la création de brouillons. Reconnecte-la pour activer cette fonction.",
      )
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (workspaceId && (await this.suppression.isSuppressed(workspaceId, request.to))) {
      throw new ConflictException('Ce destinataire s’est désabonné et ne peut pas être recontacté.')
    }

    // #2955 (#2394.57, décision Louis 28/09) — NO-GO : répondre à un fil sans
    // écrire à quelqu'un qui en fait RÉELLEMENT partie. `threadId` sans
    // `conversationId` (composition manuelle depuis l'écran de messagerie,
    // hors chat) : comportement inchangé, aucune vérification. `known ===
    // null` (ce fil n'a été vu par AUCUN message de CETTE conversation) :
    // NON MESURÉ, jamais bloquant — on ne refuse que sur une preuve
    // CONTRAIRE, jamais sur son absence.
    if (workspaceId && request.threadId && request.conversationId) {
      const known = await this.knownMailThreadParticipants(workspaceId, request.conversationId, request.threadId)
      if (known && !known.includes(normalizeAddress(request.to))) {
        throw new BadRequestException(
          'Ce destinataire n’apparaît pas parmi les personnes connues de ce fil : vérifie l’adresse avant de déposer ce brouillon.',
        )
      }
    }

    // #1959.3 — LE CHAT APPELLE CET ENDPOINT EN DIRECT (`mailboxApi.createDraft`
    // depuis `PendingActions.tsx`), sans passer par `dispatchIdempotent`
    // (`schedule_reminder`) : un double clic ou un rejeu réseau déposait deux
    // brouillons dans la VRAIE messagerie. `idempotencyKey` est optionnelle et
    // absente ⇒ chemin byte-identique à avant ce paramètre.
    const idempotencyKey = request.idempotencyKey?.trim()
    if (idempotencyKey && workspaceId) {
      const replay = await this.claimMailDraftAttempt(workspaceId, idempotencyKey, userId)
      if (replay) return replay
    }

    const signature = await this.resolveSignature(userId, connected.backend)
    const result = senderConnectionId
      ? await connected.backend.createDraft(userId, request, signature, senderConnectionId)
      : await connected.backend.createDraft(userId, request, signature)
    if (idempotencyKey && workspaceId) {
      await this.recordMailDraftOutcome(workspaceId, idempotencyKey, result)
    }
    return result
  }

  /**
   * #4412 — le brouillon d'un e-mail PRÉPARÉ pour un contact (Contacts → « Préparer
   * un e-mail »). Réutilise {@link createDraft} (opt-out, signature, démo : un seul
   * chemin d'écriture). Si un message a déjà été envoyé à ce contact depuis Bellum,
   * le brouillon rejoint CE fil (`outreach_messages.provider_thread_id`) ; sinon
   * nouveau message — jamais un fil deviné.
   */
  async createContactDraft(
    userId: string,
    item: { contactId: string; to: string; subject: string; body: string; senderConnectionId?: string },
  ): Promise<{ provider: MailboxProvider }> {
    const rows = await this.contacts.query<{ provider_thread_id: string | null }[]>(
      `SELECT provider_thread_id FROM outreach_messages
        WHERE user_id = $1 AND contact_id = $2 AND provider_thread_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [userId, item.contactId],
    )
    const threadId = rows?.[0]?.provider_thread_id ?? undefined
    const result = await this.createDraft(
      userId,
      mailDraftRequestSchema.parse({
        to: item.to,
        subject: item.subject,
        body: item.body,
        ...(threadId ? { threadId } : {}),
      }),
      item.senderConnectionId,
    )
    return { provider: result.provider }
  }

  /**
   * Supprimer un brouillon (#2277.34, épopée #2771) — le rollback de
   * {@link createDraft}. Même garde de salle de démonstration : rien n'est
   * déposé en démo, donc rien n'y est jamais à supprimer non plus.
   */
  async deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) return { deleted: false }
    const connected = await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.draft) {
      throw this.missingCapability(
        connected.status,
        'draft',
        "La messagerie connectée n'autorise pas la gestion des brouillons. Reconnecte-la pour activer cette fonction.",
      )
    }
    return connected.backend.deleteDraft(userId, draftId)
  }

  /**
   * Réclame la clé AVANT tout dépôt — même table et même motif que
   * `ActionRouterService.dispatchIdempotent` (`action_dispatch_attempts`,
   * migration `ActionDispatchIdempotency`) : « suivi, pas réinventé ». Une
   * ligne de réclamation par (espace, clé) ; l'unicité tranche à la place de
   * deux requêtes concurrentes qui liraient toutes deux une table vide.
   *
   * Rend le brouillon déjà déposé (réclamation `done`, relu depuis
   * `external_ref` — le SEUL endroit qui porte le résultat complet, cette
   * table n'ayant pas de colonne dédiée à un JSON de brouillon) quand la clé a
   * déjà servi, ou `null` pour laisser le dépôt suivre son cours normal.
   */
  private async claimMailDraftAttempt(
    workspaceId: string,
    idempotencyKey: string,
    userId: string,
  ): Promise<MailDraftResult | null> {
    try {
      await this.profiles.query(
        `INSERT INTO action_dispatch_attempts (workspace_id, idempotency_key, intent_type, user_id) VALUES ($1, $2, $3, $4)`,
        [workspaceId, idempotencyKey, 'create_mail_draft_direct', userId],
      )
      return null
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Une autre tentative a déjà réclamé cette clé — on ne dépose jamais un
      // second brouillon pour la retrouver.
      const rows = (await this.profiles.query(
        `SELECT status, external_ref FROM action_dispatch_attempts WHERE workspace_id = $1 AND idempotency_key = $2`,
        [workspaceId, idempotencyKey],
      )) as { status: string | null; external_ref: string | null }[]
      const row = rows[0]
      if (row?.status === 'done' && row.external_ref) {
        try {
          return JSON.parse(row.external_ref) as MailDraftResult
        } catch {
          // Ligne illisible : on refuse plutôt que de déposer un second
          // brouillon en devinant un résultat.
        }
      }
      // `status` NULL (l'autre tentative est encore EN VOL — vraie
      // concurrence) ou illisible : on refuse, jamais un second dépôt en
      // silence. La doctrine « un timeout n'est pas un échec » s'applique
      // côté client, pas ici — cette réponse-ci est déjà connue : la clé est
      // prise.
      throw new ConflictException('Un brouillon est déjà en cours de dépôt pour ce message.')
    }
  }

  /** Best-effort, comme le journal : un échec d'écriture ici ne doit pas faire
   *  mentir un dépôt qui a réussi. */
  private async recordMailDraftOutcome(
    workspaceId: string,
    idempotencyKey: string,
    result: MailDraftResult,
  ): Promise<void> {
    try {
      await this.profiles.query(
        `UPDATE action_dispatch_attempts SET status = 'done', external_ref = $3, completed_at = now()
          WHERE workspace_id = $1 AND idempotency_key = $2`,
        [workspaceId, idempotencyKey, JSON.stringify(result)],
      )
    } catch (error) {
      this.logger.error('mail draft idempotency outcome write failed', { error })
    }
  }

  /**
   * La signature réelle de l'utilisateur.
   *
   * Ordre volontaire : ce que l'utilisateur a écrit dans Bellum l'emporte sur ce
   * que le fournisseur stocke. Quelqu'un qui prend la peine de saisir une
   * signature dans Réglages exprime une intention plus récente que la signature
   * HTML posée dans Gmail il y a deux ans. En dernier recours : `null`, et le
   * brouillon part sans signature — jamais avec un marque-place.
   */
  async resolveSignature(userId: string, backend?: MailboxBackend): Promise<string | null> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    const own = profile?.email_signature?.trim()
    if (own) return own

    const target = backend ?? (await this.connectedBackend(userId))?.backend
    if (!target) return null
    try {
      const signature = await target.signature(userId)
      return signature.text
    } catch (error) {
      this.logger.warn(`Signature lookup failed: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Enregistre la signature saisie DANS Bellum.
   *
   * Une chaîne vide l'efface et fait retomber la résolution sur celle du
   * fournisseur : « je n'en veux pas ici » n'est pas « je n'ai rien saisi », et
   * seule la seconde doit aller interroger la messagerie.
   */
  async setSignature(userId: string, signature: string): Promise<{ signature: string | null }> {
    const trimmed = signature.trim()
    await this.profiles.update({ user_id: userId }, { email_signature: trimmed || null })
    return { signature: await this.resolveSignature(userId) }
  }

  async getOutOfOffice(userId: string): Promise<OutOfOfficeRequest | null> {
    // Théo D settings-integrations.DÉC.absence — la salle montre un exemple éteint, sans appeler de fournisseur.
    if (await this.workspaceContext.isDemoWorkspace(userId)) return demoOutOfOffice(new Date())
    const connected = await this.connectedBackend(userId)
    if (!connected) return null
    return connected.backend.getOutOfOffice(userId)
  }

  async setOutOfOffice(userId: string, request: OutOfOfficeRequest): Promise<OutOfOfficeRequest> {
    // La salle n'écrit rien chez un fournisseur : la saisie est rendue telle quelle (le visiteur voit le geste aboutir).
    if (await this.workspaceContext.isDemoWorkspace(userId)) return request
    const connected = await this.connectedBackend(userId)
    if (!connected) throw this.notConnected()
    if (!connected.status.capabilities.outOfOffice) {
      throw this.missingCapability(
        connected.status,
        'outOfOffice',
        "La messagerie connectée ne donne pas accès aux réponses d'absence. Reconnecte-la pour activer cette fonction.",
      )
    }
    // Une date incohérente n'est PAS un échec de connecteur : c'est une saisie
    // invalide, et elle reste un 400. La traduire en `scope_missing` enverrait
    // reconnecter un outil qui va très bien.
    if (request.enabled && request.startsAt && request.endsAt && request.endsAt <= request.startsAt) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.')
    }
    return connected.backend.setOutOfOffice(userId, request)
  }

  /**
   * MARQUER un fil comme traité, ou le signaler non pertinent (#2104.7 /
   * #2104.8). `mark: null` EFFACE la décision — un fil « traité » par erreur
   * doit pouvoir revenir en arrière sans détour.
   *
   * N'appelle AUCUN backend : contrairement à `createDraft` ou `sendBatch`,
   * ce n'est pas une action sur la messagerie du fournisseur, c'est une
   * annotation qui nous appartient. Elle fonctionne donc identiquement,
   * connecté ou non — y compris en salle de démonstration (voir
   * `DEMO_PURGE_USER_TABLES`, `demo-reset.service.ts`).
   *
   * `.upsert` ne touche QUE la colonne `state` : un fil déjà rattaché à la
   * main (#2104.6) garde son compte quand on le marque traité ensuite — les
   * deux décisions coexistent sur la même ligne sans s'écraser.
   */
  async setThreadMark(
    userId: string,
    threadId: string,
    mark: MailThreadMark | null,
  ): Promise<{ mark: MailThreadMark | null }> {
    await this.marks.upsert(
      { user_id: userId, thread_id: threadId, state: mark },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
    return { mark }
  }

  /**
   * RATTACHER un fil à un compte À LA MAIN (#2104.6), quand l'auto-détection
   * (`thread-account-link.ts`) n'a rien trouvé avec certitude. Le compte
   * doit appartenir à l'espace de travail actif de l'utilisateur — sans quoi
   * n'importe quel identifiant rattacherait un fil à un dossier d'un autre
   * client, une fuite entre organisations.
   *
   * `.upsert` ne touche QUE la colonne `account_id` : une marque « traité »
   * déjà posée (#2104.7) n'est pas effacée par ce rattachement.
   */
  async linkThreadAccount(userId: string, threadId: string, accountId: string): Promise<{ accountId: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = workspaceId
      ? await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
      : null
    if (!account) throw new BadRequestException("Ce compte n'existe pas dans ton espace de travail.")

    await this.marks.upsert(
      { user_id: userId, thread_id: threadId, account_id: accountId },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
    return { accountId }
  }
}

/** Même détection qu'`action-router.service.ts` (et `sprints.service.ts`,
 *  `contacts.service.ts`) — dupliquée plutôt que partagée, comme ce dépôt le
 *  fait déjà ailleurs pour la même raison : un import cross-module pour six
 *  lignes pures coûterait plus qu'il ne rendrait. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown; driverError?: { code?: unknown } }).code
  const driverCode = (error as { driverError?: { code?: unknown } }).driverError?.code
  return code === '23505' || driverCode === '23505'
}
