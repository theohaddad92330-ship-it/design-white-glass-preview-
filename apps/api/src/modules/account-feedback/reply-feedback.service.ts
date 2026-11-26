import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThan, Repository } from 'typeorm'
import {
  DEFAULT_FEEDBACK_REUSE_SCOPE,
  replyDigest,
  type CreateReplyFeedback,
  type ReplyFeedbackAck,
  type ReplyFeedbackCategory,
  type ReplyFeedbackItem,
  type ReplyFeedbackReason,
  type ReplyFeedbackVerdict,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  assembleReplyFeedbackMemory,
  countRepliesWithReason,
  REPLY_FEEDBACK_REPEAT_THRESHOLD,
  type ReplyMemoryRow,
} from './reply-feedback-memory'

/** Les réponses récentes de l'espace parmi lesquelles on retrouve le message. */
const MESSAGE_LOOKUP_LIMIT = 100
/** Ce que Laura relit : les retours des 90 derniers jours, 100 au plus. */
const MEMORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const MEMORY_FETCH_LIMIT = 100
const HISTORY_FETCH_LIMIT = 200

function toItem(row: ChatReplyFeedbackEntity): ReplyFeedbackItem {
  return {
    id: row.id,
    replyDigest: row.reply_digest,
    verdict: row.verdict as ReplyFeedbackVerdict,
    reason: (row.reason as ReplyFeedbackReason | null) ?? null,
    category: (row.category as ReplyFeedbackCategory | null) ?? null,
    accountCorrected: row.account_feedback_id !== null,
    createdAt: row.created_at.toISOString(),
  }
}

function toMemoryRow(row: ChatReplyFeedbackEntity, accountName: string | null): ReplyMemoryRow {
  return {
    reply_digest: row.reply_digest,
    verdict: row.verdict as ReplyFeedbackVerdict,
    reason: (row.reason as ReplyFeedbackReason | null) ?? null,
    note: row.note,
    correction_field: row.correction_field,
    correction_value: row.correction_value,
    correction_scope: row.correction_scope,
    account_name: accountName,
    created_at: row.created_at,
  }
}

/**
 * #1919 — les retours d'une personne sur les réponses de Laura.
 *
 * Tout est cloisonné espace + AUTEUR : l'identité vient de l'appelant résolu
 * (JWT + espace actif), jamais du corps. Ce service n'orchestre rien d'autre —
 * la correction de dossier (#1919.7) est décidée par le contrôleur, qui seul
 * peut exiger la permission `records:write`.
 */
@Injectable()
export class ReplyFeedbackService {
  private readonly logger = new Logger(ReplyFeedbackService.name)

  constructor(
    @InjectRepository(ChatReplyFeedbackEntity)
    private readonly feedback: Repository<ChatReplyFeedbackEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  /**
   * Le compte et le contact que la réponse porte appartiennent à l'espace — 404
   * sinon. Ce n'est pas une politesse : le nom d'un compte est relu dans le
   * prompt, et un identifiant d'un autre espace y ferait entrer le client d'un
   * concurrent.
   */
  async assertTargetsInWorkspace(args: {
    workspaceId: string
    accountId: string | null
    contactId: string | null
  }): Promise<void> {
    if (args.accountId) {
      const account = await this.accounts.findOne({ where: { id: args.accountId, workspace_id: args.workspaceId } })
      if (!account) throw new NotFoundException('Compte introuvable')
    }
    if (args.contactId) {
      const contact = await this.contacts.findOne({ where: { id: args.contactId, workspace_id: args.workspaceId } })
      if (!contact) throw new NotFoundException('Contact introuvable')
    }
  }

  async create(args: {
    workspaceId: string
    userId: string
    body: CreateReplyFeedback
    accountFeedbackId: string | null
  }): Promise<ReplyFeedbackAck> {
    const { body } = args
    // #1919.14 — relié à la réponse d'origine : l'empreinte toujours, l'identifiant
    // du message quand il est déjà écrit. Jamais le texte.
    const messageId = await this.resolveMessageId(args.workspaceId, body.replyDigest)
    const saved = await this.feedback.save(
      this.feedback.create({
        workspace_id: args.workspaceId,
        user_id: args.userId,
        reply_digest: body.replyDigest,
        message_id: messageId,
        account_id: body.accountId ?? null,
        contact_id: body.contactId ?? null,
        action_kind: body.actionKind ?? null,
        verdict: body.verdict,
        reason: body.reason ?? null,
        category: body.category ?? null,
        note: body.note?.trim() || null,
        correction_field: body.correction?.field.trim() ?? null,
        correction_value: body.correction?.value?.trim() || null,
        correction_scope: body.correction?.scope ?? null,
        account_feedback_id: args.accountFeedbackId,
        // GA-47 — ce retour ne sert qu'à son auteur : la portée la plus fermée,
        // écrite au site d'écriture plutôt que laissée au défaut SQL.
        reuse_scope: DEFAULT_FEEDBACK_REUSE_SCOPE,
      }),
    )

    const preferenceSuggestion =
      body.reason === 'trop_long' ? await this.shorterRepliesSuggestion(args.workspaceId, args.userId) : null

    this.logger.log('Reply feedback recorded', { workspaceId: args.workspaceId, verdict: body.verdict })
    return { item: toItem(saved), preferenceSuggestion }
  }

  /** #1917.17 — les retours actifs de la personne, pour les remontrer sous leurs réponses. */
  async listMine(args: { workspaceId: string; userId: string }): Promise<ReplyFeedbackItem[]> {
    const rows = await this.feedback.find({
      where: { workspace_id: args.workspaceId, user_id: args.userId, withdrawn_at: IsNull() },
      order: { created_at: 'DESC' },
      take: HISTORY_FETCH_LIMIT,
    })
    return rows.map(toItem)
  }

  /** Retirer son retour : il reste daté en base, il ne pèse plus sur rien. */
  async withdraw(args: { id: string; workspaceId: string; userId: string }): Promise<boolean> {
    const result = await this.feedback.update(
      { id: args.id, workspace_id: args.workspaceId, user_id: args.userId, withdrawn_at: IsNull() },
      { withdrawn_at: new Date() },
    )
    return (result.affected ?? 0) > 0
  }

  /**
   * #1919.15 — les lignes que Laura relit pour CETTE personne, ou `''`.
   *
   * Best-effort : une lecture ratée rend `''` (prompt inchangé) — la mémoire ne
   * casse jamais un tour de chat.
   */
  async memoryFor(args: { workspaceId: string; userId: string }): Promise<string> {
    try {
      const rows = await this.feedback.find({
        where: {
          workspace_id: args.workspaceId,
          user_id: args.userId,
          withdrawn_at: IsNull(),
          created_at: MoreThan(new Date(Date.now() - MEMORY_WINDOW_MS)),
        },
        order: { created_at: 'DESC' },
        take: MEMORY_FETCH_LIMIT,
      })
      if (rows.length === 0) return ''
      const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => Boolean(id)))]
      const accounts =
        accountIds.length > 0
          ? await this.accounts.find({
              where: { id: In(accountIds), workspace_id: args.workspaceId },
              select: { id: true, company_name: true },
            })
          : []
      const names = new Map(accounts.map(account => [account.id, account.company_name]))
      return assembleReplyFeedbackMemory(
        rows.map(row => toMemoryRow(row, row.account_id ? (names.get(row.account_id) ?? null) : null)),
      )
    } catch (error) {
      this.logger.warn('Reply feedback memory lookup failed — chatting without it', {
        workspaceId: args.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      })
      return ''
    }
  }

  private async resolveMessageId(workspaceId: string, digest: string): Promise<string | null> {
    try {
      const recent = await this.messages.find({
        where: { workspace_id: workspaceId, role: 'assistant' },
        select: { id: true, content: true },
        order: { created_at: 'DESC' },
        take: MESSAGE_LOOKUP_LIMIT,
      })
      return recent.find(message => replyDigest(message.content ?? '') === digest)?.id ?? null
    } catch {
      // Le lien par empreinte suffit à relier ; un identifiant manquant n'est
      // jamais une raison de perdre le retour.
      return null
    }
  }

  /**
   * #1928.7 — proposer une préférence de réponses courtes, seulement quand la
   * même personne a dit « trop long » sur {@link REPLY_FEEDBACK_REPEAT_THRESHOLD}
   * réponses DISTINCTES. Le même compte que la ligne RÉPÉTÉ du prompt.
   */
  private async shorterRepliesSuggestion(
    workspaceId: string,
    userId: string,
  ): Promise<ReplyFeedbackAck['preferenceSuggestion']> {
    try {
      const rows = await this.feedback.find({
        where: { workspace_id: workspaceId, user_id: userId, withdrawn_at: IsNull() },
        order: { created_at: 'DESC' },
        take: HISTORY_FETCH_LIMIT,
      })
      const count = countRepliesWithReason(
        rows.map(row => toMemoryRow(row, null)),
        'trop_long',
      )
      return count >= REPLY_FEEDBACK_REPEAT_THRESHOLD ? { kind: 'shorter_replies', count } : null
    } catch {
      return null
    }
  }
}
