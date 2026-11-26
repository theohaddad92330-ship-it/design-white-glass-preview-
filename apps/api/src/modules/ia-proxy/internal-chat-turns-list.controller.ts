import { Controller, Get, ParseIntPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'

type InternalChatTurnSummary = {
  turnId: string
  workspaceId: string | null
  workspaceName: string | null
  startedAt: string
  messageCount: number
  /** Noms des outils appelés (`reasoning_trace.tools_called`) ; `[]` = aucun, ou tour d'avant la trace. */
  toolsCalled: string[]
}

type Row = {
  turn_id: string
  workspace_id: string | null
  workspace_name: string | null
  started_at: Date | string
  message_count: number | string
  tools: string[] | null
}

export const CHAT_TURNS_PAGE_MAX = 50

/**
 * #3391 — LA LISTE DES DERNIERS TOURS DE LAURA, point d'entrée du replay
 * (`GET /internal/chat-turn/:turnId`) dans le DM. Même porte que le replay
 * (`InternalSecretGuard`), lecture seule, cross-tenant ; l'appelant DM
 * journalise la lecture.
 *
 * ⚠️ AUCUN CORPS DE MESSAGE : la requête ne sélectionne ni `content` ni le
 * contexte — seulement la date, l'espace, un COMPTE de messages et les NOMS des
 * outils. Le corps d'un message ne sort vers un humain que par le replay, déjà
 * journalisé (doctrine).
 */
@Controller('internal/chat-turns')
@UseGuards(InternalSecretGuard)
export class InternalChatTurnsListController {
  constructor(@InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>) {}

  @Get()
  async list(
    @Query('workspaceId', new ParseUUIDPipe({ optional: true })) workspaceId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<InternalChatTurnSummary[]> {
    const take = Math.min(Math.max(limit ?? 25, 1), CHAT_TURNS_PAGE_MAX)
    const skip = Math.max(offset ?? 0, 0)
    const params: unknown[] = []
    let scope = ''
    if (workspaceId) {
      params.push(workspaceId)
      scope = `AND m.workspace_id = $${params.length}`
    }
    params.push(take, skip)
    const rows: Row[] = await this.messages.query(
      `SELECT m.turn_id, m.workspace_id, w.name AS workspace_name,
              MIN(m.created_at) AS started_at, COUNT(*)::int AS message_count,
              COALESCE((
                SELECT jsonb_agg(DISTINCT t)
                FROM chat_messages m2,
                     jsonb_array_elements_text(
                       CASE WHEN jsonb_typeof(m2.context->'reasoning_trace'->'tools_called') = 'array'
                            THEN m2.context->'reasoning_trace'->'tools_called' ELSE '[]'::jsonb END
                     ) AS t
                WHERE m2.turn_id = m.turn_id
              ), '[]'::jsonb) AS tools
         FROM chat_messages m
         LEFT JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.turn_id IS NOT NULL ${scope}
        GROUP BY m.turn_id, m.workspace_id, w.name
        ORDER BY MIN(m.created_at) DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return rows.map(row => ({
      turnId: row.turn_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      startedAt: new Date(row.started_at).toISOString(),
      messageCount: Number(row.message_count),
      toolsCalled: row.tools ?? [],
    }))
  }
}
