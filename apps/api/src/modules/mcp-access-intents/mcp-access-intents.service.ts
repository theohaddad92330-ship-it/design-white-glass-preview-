import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { CreateMcpAccessIntentInput, DecideMcpAccessIntentInput, McpAccessIntent } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { McpAccessIntentEntity } from '../../database/entities/mcp-access-intent.entity'

type Row = {
  id: string
  name: string
  perimeter: McpAccessIntent['perimeter']
  status: McpAccessIntent['status']
  requested_by: string
  first_name: string | null
  last_name: string | null
  created_at: Date
  decided_at: Date | null
}

function toView(row: Row): McpAccessIntent {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return {
    id: row.id,
    name: row.name,
    perimeter: row.perimeter,
    status: row.status,
    requestedBy: row.requested_by,
    requestedByName: fullName || null,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
  }
}

const SELECT = `
  SELECT i.id, i.name, i.perimeter, i.status, i.requested_by, i.created_at, i.decided_at, p.first_name, p.last_name
    FROM mcp_access_intents i
    LEFT JOIN profiles p ON p.user_id = i.requested_by`

/**
 * Théo D settings-outils.N1 — le cadre d'un nouvel accès. L'intention est écrite par un membre, tranchée par un
 * administrateur ; rien ici ne délivre un jeton ni un droit d'écriture.
 */
@Injectable()
export class McpAccessIntentsService {
  constructor(@InjectRepository(McpAccessIntentEntity) private readonly intents: Repository<McpAccessIntentEntity>) {}

  async create(workspaceId: string, userId: string, input: CreateMcpAccessIntentInput): Promise<McpAccessIntent> {
    const saved = await this.intents.save(
      this.intents.create({
        workspace_id: workspaceId,
        requested_by: userId,
        name: input.name,
        perimeter: input.perimeter,
      }),
    )
    const [row] = await this.intents.manager.query<Row[]>(`${SELECT} WHERE i.id = $1`, [saved.id])
    if (!row) throw new NotFoundException('Cette demande n’existe plus.')
    return toView(row)
  }

  /** Les demandes d'UN membre, dans son espace — les plus récentes d'abord. */
  async listMine(workspaceId: string, userId: string): Promise<McpAccessIntent[]> {
    const rows = await this.intents.manager.query<Row[]>(
      `${SELECT} WHERE i.workspace_id = $1 AND i.requested_by = $2 ORDER BY i.created_at DESC LIMIT 50`,
      [workspaceId, userId],
    )
    return rows.map(toView)
  }

  /** Les demandes en attente de TOUT l'espace — réservé à qui peut les trancher. */
  async listPending(workspaceId: string): Promise<McpAccessIntent[]> {
    const rows = await this.intents.manager.query<Row[]>(
      `${SELECT} WHERE i.workspace_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC LIMIT 50`,
      [workspaceId],
    )
    return rows.map(toView)
  }

  async decide(
    workspaceId: string,
    userId: string,
    id: string,
    input: DecideMcpAccessIntentInput,
  ): Promise<McpAccessIntent> {
    // Une demande déjà tranchée ne se retranche pas : l'update ne touche que `pending`.
    const result = await this.intents.update(
      { id, workspace_id: workspaceId, status: 'pending' },
      { status: input.decision, decided_by: userId, decided_at: new Date() },
    )
    if (!result.affected) throw new NotFoundException('Cette demande n’existe plus ou est déjà tranchée.')
    const [row] = await this.intents.manager.query<Row[]>(`${SELECT} WHERE i.id = $1 AND i.workspace_id = $2`, [
      id,
      workspaceId,
    ])
    if (!row) throw new NotFoundException('Cette demande n’existe plus.')
    return toView(row)
  }
}
