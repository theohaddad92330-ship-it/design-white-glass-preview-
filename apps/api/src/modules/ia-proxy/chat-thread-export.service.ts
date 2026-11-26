import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import type { CardPreview, CardResult, ConnectedTool } from '@bellum/contracts'
import { machineReplyText } from '../../common/reply-plain-text'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { notConnectedCapabilityLabels } from '../tool-registry/tool-capability-digest'
import { extractSources, type ChatThreadExport } from './chat-thread-export'
import { resolveThreadAccountNames } from './chat-thread-accounts'
import { ChatMessagesService } from './chat-messages.service'

/**
 * #1957.8 — même borne de prudence que la lecture du plafond quotidien : au-delà,
 * un fil est déclaré TRONQUÉ plutôt que composé sur une partie qu'on ne nomme pas.
 */
const EXPORT_MESSAGE_LIMIT = 1000
/** #3895.1 — « Extrait » : les derniers messages du fil, pas davantage. */
const EXPORT_EXTRACT_LIMIT = 30
/** #3895.8 — la borne de sûreté du fil complet : 50 pages de 1 000 messages. */
const EXPORT_MAX_PAGES = 50

/**
 * Ce qu'une carte CONFIRMÉE apporte à l'export — les seuls champs que la section
 * « actions » relit. Une FORME, pas le service qui la produit : GA-07 refuse
 * qu'un service aille chercher celui d'un autre module, et le contrat partagé
 * (`CardPreview` / `CardResult`, `@bellum/contracts`) est la réponse que la
 * garde nomme. L'orchestration — qui appelle Action OS et le registre d'outils —
 * vit dans le contrôleur, là où vit le geste utilisateur.
 */
/** #3895.5 — le SHA court du déploiement (même source que la santé) ; absent hors déploiement, jamais inventé. */
function deployedVersion(): string | null {
  const sha = process.env['RAILWAY_GIT_COMMIT_SHA']?.trim()
  return sha ? sha.slice(0, 7) : null
}

export type ChatThreadExportConfirmedCard = {
  preview: CardPreview | null
  result: CardResult | null
}

@Injectable()
export class ChatThreadExportService {
  constructor(
    private readonly messages: ChatMessagesService,
    @InjectRepository(ChatMessageEntity)
    private readonly repo: Repository<ChatMessageEntity>,
  ) {}

  /**
   * #1955.7 — compose l'export d'UN fil, ou lève `NotFoundException` quand il
   * n'existe pas dans cet espace (même refus que l'archivage / la suppression :
   * un succès qui n'a rien exporté ne se dit pas).
   */
  async build(args: {
    /** #2703 — on exporte SON fil par défaut ; une conversation nommée reste celle de l'espace. */
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    /** Le registre d'outils de l'espace, LU par le contrôleur (GA-07). */
    connectedTools: readonly ConnectedTool[]
    /** Les cartes confirmées du fil, LUES par le contrôleur (GA-07). */
    confirmedCards: readonly ChatThreadExportConfirmedCard[]
    /** #3895.1 — « extract » : les derniers messages seulement ; « full » (défaut) : le fil entier. */
    scope?: 'extract' | 'full'
  }): Promise<ChatThreadExport> {
    // #3895.8 (Louis 15/10/2026) — l'export est le fil COMPLET : on remonte page par page
    // (`before` = le plus ancien message déjà lu) jusqu'au premier message. Seul un fil au-delà
    // de `EXPORT_MAX_PAGES` pages se déclare encore extrait — jamais en silence.
    const pages: Awaited<ReturnType<ChatMessagesService['listThread']>>[] = []
    let before: Date | null = null
    let truncated = false
    for (let page = 0; args.scope !== 'extract'; page++) {
      const rows = await this.messages.listThread({
        userId: args.userId,
        accountId: args.accountId,
        conversationId: args.conversationId,
        limit: EXPORT_MESSAGE_LIMIT,
        workspaceId: args.workspaceId,
        ...(before ? { before } : {}),
      })
      pages.unshift(rows)
      if (rows.length < EXPORT_MESSAGE_LIMIT) break
      if (page + 1 >= EXPORT_MAX_PAGES) {
        truncated = true
        break
      }
      before = rows[0]?.created_at ?? null
      if (!before) break
    }
    if (args.scope === 'extract') {
      // #3895.1 — UNE lecture, un message de plus que l'extrait : c'est lui qui dit si le fil en compte davantage.
      const rows = await this.messages.listThread({
        userId: args.userId,
        accountId: args.accountId,
        conversationId: args.conversationId,
        limit: EXPORT_EXTRACT_LIMIT + 1,
        workspaceId: args.workspaceId,
      })
      truncated = rows.length > EXPORT_EXTRACT_LIMIT
      pages.push(truncated ? rows.slice(rows.length - EXPORT_EXTRACT_LIMIT) : rows)
    }
    const thread = pages.flat()
    if (thread.length === 0) throw new NotFoundException('Conversation introuvable dans cet espace.')

    const accountNames = args.accountId
      ? await resolveThreadAccountNames(this.repo.manager, args.workspaceId, [args.accountId])
      : new Map<string, string>()

    const messages = thread.map(row => ({
      role: row.role,
      author: row.author,
      // #3979.2 — une carte (`bellum-block`) ne se lit qu'à l'écran : l'export reçoit son TEXTE.
      content: row.role === 'assistant' ? machineReplyText(row.content) : row.content,
      createdAt: row.created_at.toISOString(),
    }))

    const authors = [
      ...new Set(messages.map(message => message.author?.firstName).filter((name): name is string => Boolean(name))),
    ]

    return {
      title: `Fil du ${messages[0]?.createdAt.slice(0, 10) ?? ''}`,
      generatedAt: new Date().toISOString(),
      scope: {
        accountId: args.accountId,
        accountName: args.accountId ? (accountNames.get(args.accountId) ?? null) : null,
      },
      authors,
      messages,
      sources: extractSources(messages),
      actions: args.confirmedCards.map(card => ({
        whatWillHappen: card.preview?.whatWillHappen ?? '(aperçu indisponible)',
        targetObject: card.preview?.targetObject ?? '',
        destination: card.preview?.destination ?? null,
        outcome: card.result?.outcome ?? null,
        occurredAt: card.result?.occurredAt ?? null,
      })),
      limits: notConnectedCapabilityLabels(args.connectedTools),
      // #3895.5 / #3895.8 — complet, sauf au-delà de la borne de pages (dit, jamais tu).
      coverage: { messageCount: messages.length, truncated },
      productVersion: deployedVersion(),
    }
  }
}
