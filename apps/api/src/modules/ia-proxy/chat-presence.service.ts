import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ChatPresenceMember } from '@bellum/contracts'
import { MoreThan, Repository } from 'typeorm'
import { ChatPresenceEntity } from '../../database/entities/chat-presence.entity'
import { resolveWorkspaceAuthors } from '../../common/workspace-authors'

/**
 * #3086 — depuis quand un battement de coeur COMPTE comme « encore présent ».
 * Le navigateur bat toutes les 10 s (`useChatPresence.ts`) ; deux battements
 * manqués (fermeture d'onglet, veille, coupure réseau) suffisent à faire
 * disparaître le nom SANS geste de départ explicite — la personne n'annonce
 * jamais qu'elle part, elle cesse juste d'envoyer son battement.
 */
export const PRESENCE_TTL_MS = 25_000

/** Le fictif que la salle de démonstration montre sur CHAQUE fil (recette #3086). */
const DEMO_MEMBER: ChatPresenceMember = { firstName: 'Camille', avatarUrl: null }

/**
 * #3086 — « afficher si une personne est sur une conversation » (Apricot
 * Labs, deux sièges, un même espace). Un membre bat le coeur tant qu'il a le
 * fil ouvert ; la lecture rend qui d'autre, dans le MÊME espace, a fait de
 * même dans la fenêtre {@link PRESENCE_TTL_MS}. Table éphémère, jamais un fait
 * durable (migration `1796321990410-ChatPresence`).
 */
@Injectable()
export class ChatPresenceService {
  private readonly logger = new Logger(ChatPresenceService.name)

  constructor(
    @InjectRepository(ChatPresenceEntity)
    private readonly presence: Repository<ChatPresenceEntity>,
  ) {}

  /**
   * `(accountId, conversationId)` en UNE clé TEXT non nullable : Postgres ne
   * traite jamais deux `NULL` comme égaux dans l'index unique que l'upsert
   * doit retrouver, et le fil PAR DÉFAUT porte justement les deux à `null`.
   */
  threadKeyOf(accountId: string | null, conversationId: string | null): string {
    return `${accountId ?? '·'}:${conversationId ?? '·'}`
  }

  async heartbeat(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    // #1942.2 — SALLE DE DÉMONSTRATION, résolue par l'appelant (GA-07 : ce
    // service ne va pas chercher lui-même `WorkspaceContextService`, même
    // raison que le tour de chat lui-même, `ia-proxy.controller.ts`) : aucune
    // ligne écrite, un visiteur ne laisse aucune trace que le suivant relirait.
    isDemoWorkspace: boolean
  }): Promise<void> {
    if (args.isDemoWorkspace) return
    try {
      await this.presence.upsert(
        {
          workspace_id: args.workspaceId,
          thread_key: this.threadKeyOf(args.accountId, args.conversationId),
          user_id: args.userId,
          updated_at: new Date(),
        },
        { conflictPaths: ['workspace_id', 'thread_key', 'user_id'] },
      )
    } catch (error) {
      // Un battement raté n'est jamais une panne pour l'appelant : au pire, la
      // personne disparaît un peu plus tôt des écrans des autres — jamais un
      // message de chat bloqué pour un signal de présence.
      this.logger.warn(`Battement de présence illisible: ${String(error)}`)
    }
  }

  /** Les AUTRES membres actifs sur ce fil — jamais l'appelant lui-même. */
  async activeMembers(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    isDemoWorkspace: boolean
  }): Promise<ChatPresenceMember[]> {
    if (args.isDemoWorkspace) return [DEMO_MEMBER]

    let rows: ChatPresenceEntity[]
    try {
      rows = await this.presence.find({
        where: {
          workspace_id: args.workspaceId,
          thread_key: this.threadKeyOf(args.accountId, args.conversationId),
          updated_at: MoreThan(new Date(Date.now() - PRESENCE_TTL_MS)),
        },
      })
    } catch (error) {
      this.logger.warn(`Présence illisible, écran rendu sans nom: ${String(error)}`)
      return []
    }
    const otherIds = rows.map(row => row.user_id).filter(id => id !== args.userId)
    if (otherIds.length === 0) return []

    const authors = await resolveWorkspaceAuthors(this.presence.manager, args.workspaceId, otherIds, 'présence de fil')
    // Un membre RÉSOLU mais sans ligne de profil lisible (parti, compte effacé)
    // ne rend rien — même règle que l'auteur d'un message (#1940.4).
    return [...new Set(otherIds)].map(id => authors.get(id)).filter((m): m is ChatPresenceMember => m !== undefined)
  }
}
