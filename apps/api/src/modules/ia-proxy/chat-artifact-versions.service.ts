import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, type Repository } from 'typeorm'
import {
  chatArtifactId,
  checkArtifactEdit,
  type ChatArtifactLatestVersion,
  type ChatArtifactVersionInput,
  type ChatArtifactVersionView,
  parseChatArtifactId,
} from '@bellum/contracts'
import { ChatArtifactVersionEntity } from '../../database/entities/chat-artifact-version.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { observeSpan } from '../../common/observability-span'

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — UN ARTEFACT MODIFIÉ CRÉE UNE NOUVELLE
 * VERSION. Le texte du message n'est jamais réécrit (c'est la version 1) ; chaque
 * modification ajoute une ligne à `chat_artifact_versions`, et la lecture du fil
 * montre la plus récente en disant laquelle (`buildChatReplyEnvelope`).
 *
 * Même visibilité que le fil : un message de réponse d'une conversation NOMMÉE
 * est partagé par l'espace ; celui du fil par défaut reste privé à son auteur.
 */
@Injectable()
export class ChatArtifactVersionsService {
  constructor(
    @InjectRepository(ChatArtifactVersionEntity) private readonly versions: Repository<ChatArtifactVersionEntity>,
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
  ) {}

  async edit(args: {
    workspaceId: string
    userId: string
    input: ChatArtifactVersionInput
  }): Promise<ChatArtifactVersionView> {
    // #2442.4 (épopée #2879) — le span artefact : une nouvelle version.
    return observeSpan('artifact', 'edit', async () => {
      const address = parseChatArtifactId(args.input.artifactId)
      if (!address) throw new NotFoundException('artifact_not_found')
      const message = await this.messages.findOne({ where: { id: address.messageId, workspace_id: args.workspaceId } })
      const visible = message && (message.conversation_id !== null || message.user_id === args.userId)
      if (!message || !visible || message.role !== 'assistant') throw new NotFoundException('artifact_not_found')

      const check = checkArtifactEdit(message.content, args.input.artifactId, args.input.block)
      if (!check.ok) {
        if (check.reason === 'unknown_artifact') throw new NotFoundException('artifact_not_found')
        throw new BadRequestException(check.reason)
      }

      // Le numéro est lu puis écrit sous la contrainte UNIQUE (message, rang, version) : deux
      // modifications simultanées ne peuvent pas écrire la même version — la seconde échoue et
      // se rejoue, jamais un écrasement silencieux.
      const latest = await this.versions.findOne({
        where: { message_id: message.id, block_rank: address.blockIndex },
        order: { version: 'DESC' },
      })
      const row = await this.versions.save(
        this.versions.create({
          workspace_id: args.workspaceId,
          message_id: message.id,
          block_rank: address.blockIndex,
          version: (latest?.version ?? 1) + 1,
          block: args.input.block,
          edited_by: args.userId,
        }),
      )
      return toView(row)
    })
  }

  /** L'historique complet d'UN artefact, de la plus récente à la plus ancienne (la version 1 est le texte du message). */
  async history(args: { workspaceId: string; artifactId: string }): Promise<ChatArtifactVersionView[]> {
    // #2442.4 — le span artefact : l'historique d'un artefact.
    return observeSpan('artifact', 'history', async () => {
      const address = parseChatArtifactId(args.artifactId)
      if (!address) throw new NotFoundException('artifact_not_found')
      const rows = await this.versions.find({
        where: { workspace_id: args.workspaceId, message_id: address.messageId, block_rank: address.blockIndex },
        order: { version: 'DESC' },
      })
      return rows.map(toView)
    })
  }

  /** La version la plus récente de chaque artefact modifié, pour les messages lus — UNE requête. */
  async latestFor(
    workspaceId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, Map<string, ChatArtifactLatestVersion>>> {
    // #2442.4 — le span artefact : la dernière version des artefacts d'un fil.
    return observeSpan('artifact', 'latest', async () => {
      const byMessage = new Map<string, Map<string, ChatArtifactLatestVersion>>()
      if (messageIds.length === 0) return byMessage
      const rows = await this.versions.find({
        where: { workspace_id: workspaceId, message_id: In([...messageIds]) },
        order: { version: 'DESC' },
      })
      for (const row of rows) {
        const id = chatArtifactId(row.message_id, row.block_rank)
        const map = byMessage.get(row.message_id) ?? new Map<string, ChatArtifactLatestVersion>()
        // `order DESC` : la première ligne vue pour un artefact est sa plus récente.
        if (!map.has(id)) {
          map.set(id, {
            version: row.version,
            block: row.block,
            editedAt: row.created_at.toISOString(),
            editedBy: row.edited_by ?? '',
          })
        }
        byMessage.set(row.message_id, map)
      }
      return byMessage
    })
  }
}

function toView(row: ChatArtifactVersionEntity): ChatArtifactVersionView {
  return {
    artifactId: chatArtifactId(row.message_id, row.block_rank),
    version: row.version,
    block: row.block,
    editedBy: row.edited_by ?? '',
    editedAt: row.created_at.toISOString(),
  }
}
