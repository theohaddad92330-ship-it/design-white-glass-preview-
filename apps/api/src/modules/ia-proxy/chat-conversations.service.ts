import type { ChatConversationAuditSnapshot, ChatConversationDetail, ChatConversationVersion } from '@bellum/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isInPortfolio } from '@bellum/contracts'
import { activeTeammateAccountIds } from '../../common/account-team-membership'
import { randomUUID } from 'node:crypto'
import { In, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatConversationEntity, ChatConversationVersionEntity } from '../../database/entities/chat-conversation.entity'
import { ChatMessagesService } from './chat-messages.service'

/** Une conversation NOMMÉE d'un espace, et qui agit dessus. */
type ConversationRef = { workspaceId: string; userId: string; conversationId: string }

const CONFLICT_PATHS = ['workspace_id', 'conversation_id']

/**
 * #2430 — L'OBJET CONVERSATION (décision de Louis, 22/09/2026 soir, §10).
 *
 * Il ÉTEND un fil nommé, il ne le remplace pas : les messages restent dans
 * `chat_messages`, désignés par leur clé, et rien ici ne les déplace ni ne les
 * réécrit. Une conversation sans ligne `chat_conversations` garde exactement
 * son comportement d'avant — c'est {@link detail} qui rend ces valeurs par
 * défaut ; une LECTURE n'écrit jamais de ligne.
 *
 * Chaque lecture et chaque écriture est bornée par `workspace_id` (les espaces
 * sont des ESN, donc des concurrents). Le fil lui-même est vérifié par
 * `ChatMessagesService.threadExists` — la même désignation que l'archivage.
 *
 * Seul un fil NOMMÉ a un objet : le fil par défaut est privé à son auteur
 * (#2703), il n'a ni propriétaire à transférer ni version à partager.
 */
@Injectable()
export class ChatConversationsService {
  constructor(
    @InjectRepository(ChatConversationEntity)
    private readonly conversations: Repository<ChatConversationEntity>,
    @InjectRepository(ChatConversationVersionEntity)
    private readonly versions: Repository<ChatConversationVersionEntity>,
    private readonly messages: ChatMessagesService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  private target(ref: ConversationRef) {
    return { userId: ref.userId, workspaceId: ref.workspaceId, accountId: null, conversationId: ref.conversationId }
  }

  private row(workspaceId: string, conversationId: string): Promise<ChatConversationEntity | null> {
    return this.conversations.findOne({ where: { workspace_id: workspaceId, conversation_id: conversationId } })
  }

  /**
   * #2430.11 — ce que la conversation porte, ou `null` quand elle n'existe pas
   * DANS CET ESPACE. Une branche neuve existe par sa ligne avant son premier
   * message ; un fil ancien existe par ses messages avant d'avoir une ligne.
   */
  async detail(ref: ConversationRef): Promise<ChatConversationDetail | null> {
    const row = await this.row(ref.workspaceId, ref.conversationId)
    if (!row && !(await this.messages.threadExists(this.target(ref)))) return null
    const declared = row?.owner_user_id ?? null
    const versions = await this.versions.find({
      where: { workspace_id: ref.workspaceId, conversation_id: ref.conversationId },
      order: { version: 'ASC' },
    })
    return {
      conversationId: ref.conversationId,
      ownerUserId: declared ?? (await this.messages.threadAuthor(this.target(ref))),
      ownerSource: declared ? 'declared' : 'opener',
      parentConversationId: row?.parent_conversation_id ?? null,
      branchedFromMessageId: row?.branched_from_message_id ?? null,
      attachedAccountId: row?.attached_account_id ?? null,
      auditSnapshot: row?.audit_snapshot ?? null,
      legalHold: row?.legal_hold_at
        ? {
            since: row.legal_hold_at.toISOString(),
            by: row.legal_hold_by ?? null,
            reason: row.legal_hold_reason ?? '',
            reviewBy: row.legal_hold_review_by?.toISOString() ?? null,
          }
        : null,
      versions: versions.map(toVersion),
    }
  }

  /**
   * #2430.12 — le propriétaire qui FAIT FOI : le déclaré, sinon qui a ouvert le
   * fil. C'est ce que la suppression (`deleteChatThread`) compare à l'appelant.
   */
  async ownerOf(ref: ConversationRef): Promise<string | null> {
    const row = await this.row(ref.workspaceId, ref.conversationId)
    return row?.owner_user_id ?? (await this.messages.threadAuthor(this.target(ref)))
  }

  /**
   * #1955.12 — le fil CITE-t-il un compte que ce lecteur ne voit pas ?
   *
   * En portefeuille CLOISONNÉ (`portfolioScopeFor`, décision D5), un membre ne
   * voit que les comptes qu'il porte, les comptes libres et ceux dont il est
   * co-équipier actif (`isInPortfolio`, #4996 L3). Un fil nommé est
   * partagé par l'espace : sans cette lecture, un lien de partage aurait montré
   * la conversation sur un compte qu'il ne peut pas ouvrir. « Cité » = un
   * message du fil porte ce compte, ou la conversation y est rattachée.
   * `ownerId` vient de `portfolioScopeFor` au CONTRÔLEUR ; ouvert, il n'appelle pas.
   */
  async citesAccountOutside(ref: ConversationRef, ownerId: string): Promise<boolean> {
    const cited = new Set(await this.messages.threadAccountIds(this.target(ref)))
    const attached = (await this.row(ref.workspaceId, ref.conversationId))?.attached_account_id
    if (attached) cited.add(attached)
    if (cited.size === 0) return false
    const accounts = await this.accounts.find({
      where: { id: In([...cited]), workspace_id: ref.workspaceId },
      select: ['id', 'assigned_to'],
    })
    const teammate = await activeTeammateAccountIds(
      this.accounts.manager,
      ref.workspaceId,
      ownerId,
      accounts.map(account => account.id),
    )
    return accounts.some(account => !isInPortfolio({ ownerId }, account, teammate.has(account.id)))
  }

  /** #2430.2 — le fil dont celui-ci est une branche, ou `null`. */
  async parentOf(workspaceId: string, conversationId: string): Promise<string | null> {
    return (await this.row(workspaceId, conversationId))?.parent_conversation_id ?? null
  }

  /**
   * #2430.2 — EXPLORER UNE AUTRE HYPOTHÈSE dans un fil NEUF, relié à son
   * origine. Le parent ne bouge pas : aucun message copié, déplacé ni marqué
   * (la réédition DANS le fil, `runBranch` + `superseded_at`, reste ce qu'elle
   * est). La branche hérite du rattachement de son parent — c'est la même
   * affaire, vue autrement.
   */
  async branch(
    ref: Omit<ConversationRef, 'conversationId'> & { fromConversationId: string; fromMessageId?: string | null },
  ): Promise<{ conversationId: string }> {
    const parentRef = { ...ref, conversationId: ref.fromConversationId }
    const parent = await this.detail(parentRef)
    if (!parent) throw new NotFoundException('Conversation introuvable dans cet espace.')
    const fromMessageId = ref.fromMessageId ?? null
    if (fromMessageId && !(await this.messages.messageInThread(this.target(parentRef), fromMessageId))) {
      throw new BadRequestException('Cette réponse n’appartient pas à la conversation d’origine.')
    }
    const conversationId = randomUUID()
    await this.conversations.insert({
      workspace_id: ref.workspaceId,
      conversation_id: conversationId,
      owner_user_id: ref.userId,
      parent_conversation_id: ref.fromConversationId,
      branched_from_message_id: fromMessageId,
      attached_account_id: parent.attachedAccountId,
      created_by: ref.userId,
    })
    return { conversationId }
  }

  /**
   * #2430.12 — TRANSFÉRER la conversation. Le propriétaire en vigueur ou un
   * gérant de l'espace (`team:manage`, résolu au contrôleur) ; le nouveau
   * propriétaire est un MEMBRE de cet espace, jamais d'un autre.
   */
  async setOwner(
    ref: ConversationRef & {
      canManage: boolean
      ownerUserId: string
      /** Lu par le CONTRÔLEUR (`getMembership`, GA-07) : le nouveau propriétaire est-il membre de CET espace ? */
      ownerIsMember: boolean
    },
  ): Promise<void> {
    if (!(await this.detail(ref))) throw new NotFoundException('Conversation introuvable dans cet espace.')
    if (!ref.canManage && (await this.ownerOf(ref)) !== ref.userId) {
      throw new ForbiddenException('Seul le propriétaire ou un gérant de l’espace transfère une conversation.')
    }
    if (!ref.ownerIsMember) {
      throw new BadRequestException('Le nouveau propriétaire doit être membre de cet espace.')
    }
    await this.upsert(ref, { owner_user_id: ref.ownerUserId })
  }

  /** #2430.12 — RATTACHER la conversation à un compte de l'espace (ou la détacher, `null`). */
  async attach(ref: ConversationRef & { accountId: string | null }): Promise<void> {
    if (!(await this.detail(ref))) throw new NotFoundException('Conversation introuvable dans cet espace.')
    if (
      ref.accountId &&
      !(await this.accounts.exist({ where: { id: ref.accountId, workspace_id: ref.workspaceId } }))
    ) {
      throw new NotFoundException('Compte introuvable dans cet espace.')
    }
    await this.upsert(ref, { attached_account_id: ref.accountId })
  }

  /**
   * #2075.29 / #2075.30 — POSER le snapshot audit à l'ouverture du fil depuis
   * l'audit commercial (« Demander à… »). Contrairement à {@link attach},
   * n'exige PAS que la conversation existe déjà : le geste qui l'appelle
   * PRÉCÈDE le premier message (le fil est minté côté client juste avant la
   * navigation), donc `detail()` rendrait encore `null` à cet instant — un
   * `upsert` crée la ligne au besoin, exactement comme un premier rattachement
   * le ferait plus tard. Un second appel sur le MÊME fil REMPLACE le snapshot
   * précédent (dernier geste gagne, même doctrine que les autres colonnes de
   * cette table) — en pratique il n'y en a qu'un, ce CTA n'ouvrant qu'un fil
   * NEUF à chaque clic (`?fresh=`).
   */
  async attachAuditSnapshot(
    ref: ConversationRef & { snapshot: Omit<ChatConversationAuditSnapshot, 'takenAt'> },
  ): Promise<void> {
    const snapshot: ChatConversationAuditSnapshot = { ...ref.snapshot, takenAt: new Date().toISOString() }
    await this.upsert(ref, { audit_snapshot: snapshot })
  }

  /**
   * #2430.10 / #2439.13 — la CONSERVATION LÉGALE : posée par un gérant, elle
   * interdit de retirer le fil (`deleteChatThread` répond 409) tant qu'elle
   * court, ET protège désormais l'ATTRIBUTION des messages qu'elle couvre
   * pendant l'effacement RGPD d'un membre (`PrivacyDeletionService` lit
   * `legal_hold_at` avant d'anonymiser). Aucune fenêtre de purge n'est
   * inventée ici : il n'y en a aucune sur les fils, et sa durée est une
   * question reportée par Louis (#1939, `privacy-retention.service.ts`).
   *
   * `reason` est REQUIS pour poser : une conservation qui n'explique pas
   * pourquoi est un blocage muet (#2439.13, « expliquer pourquoi » est la
   * première exigence). `chatConversationLegalHoldSchema` le garantit déjà
   * côté contrat ; la garde ici est la même règle tenue côté service, pour un
   * appelant qui construirait l'objet à la main.
   */
  async setLegalHold(
    ref: ConversationRef & { canManage: boolean; hold: boolean; reason?: string; reviewBy?: string },
  ): Promise<void> {
    if (!ref.canManage) throw new ForbiddenException('Seul un gérant de l’espace pose une conservation légale.')
    if (!(await this.detail(ref))) throw new NotFoundException('Conversation introuvable dans cet espace.')
    if (ref.hold && !ref.reason?.trim()) {
      throw new BadRequestException('Une conservation légale doit dire pourquoi.')
    }
    await this.upsert(
      ref,
      ref.hold
        ? {
            legal_hold_at: new Date(),
            legal_hold_by: ref.userId,
            legal_hold_reason: ref.reason!.trim(),
            // #2439.13 — DÉCLARÉE par l'appelant, jamais calculée : `reviewBy`
            // absent = aucune date de revue, même défaut qu'avant.
            legal_hold_review_by: ref.reviewBy ? new Date(ref.reviewBy) : null,
          }
        : { legal_hold_at: null, legal_hold_by: null, legal_hold_reason: null, legal_hold_review_by: null },
    )
  }

  async isOnLegalHold(workspaceId: string, conversationId: string): Promise<boolean> {
    return Boolean((await this.row(workspaceId, conversationId))?.legal_hold_at)
  }

  /**
   * #2430.4 — FIGER une version à partager : une BORNE au dernier message du
   * fil, numérotée. Aucune copie — le lien figé lit le même fil, borné
   * ({@link versionBound}), par le même chemin que le lien vivant.
   */
  async snapshot(ref: ConversationRef): Promise<ChatConversationVersion> {
    const last = await this.messages.lastThreadMessage(this.target(ref))
    if (!last) throw new NotFoundException('Conversation introuvable dans cet espace.')
    const existing = await this.versions.find({
      where: { workspace_id: ref.workspaceId, conversation_id: ref.conversationId },
      order: { version: 'ASC' },
    })
    const version = (existing.at(-1)?.version ?? 0) + 1
    const row = {
      workspace_id: ref.workspaceId,
      conversation_id: ref.conversationId,
      version,
      up_to_message_id: last.id,
      up_to_at: last.created_at,
      created_by: ref.userId,
    }
    await this.versions.insert(row)
    return toVersion({ ...row, created_at: new Date() } as ChatConversationVersionEntity)
  }

  /** #2430.4 — la borne d'une version, ou `null` si elle n'existe pas dans cet espace. */
  async versionBound(workspaceId: string, conversationId: string, version: number): Promise<Date | null> {
    const row = await this.versions.findOne({
      where: { workspace_id: workspaceId, conversation_id: conversationId, version },
    })
    return row?.up_to_at ?? null
  }

  private async upsert(ref: ConversationRef, values: Partial<ChatConversationEntity>): Promise<void> {
    await this.conversations.upsert(
      { workspace_id: ref.workspaceId, conversation_id: ref.conversationId, ...values },
      { conflictPaths: CONFLICT_PATHS },
    )
  }
}

function toVersion(row: ChatConversationVersionEntity): ChatConversationVersion {
  return {
    version: row.version,
    upToMessageId: row.up_to_message_id,
    upToAt: row.up_to_at.toISOString(),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at.toISOString(),
  }
}
