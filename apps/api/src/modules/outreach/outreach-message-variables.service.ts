import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { OutreachMessageVariable, SetOutreachMessageVariableRequest } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachMessageVariableEntity } from '../../database/entities/outreach-message-variable.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import type { OutreachCtx } from './outreach-message.service'

/**
 * #3419.1 (épopée #2947) — les variables d'une VERSION de message : valeur,
 * source, date, confiance, autorisation d'usage externe.
 *
 * Annotation DÉCLARÉE par le relecteur, rattachée à `current_version` : un
 * texte révisé repart sans annotation (append-only, jamais recopiée sur une
 * version que personne n'a relue). Ne change ni l'état ni le texte du message
 * et n'envoie rien. Le corps n'est jamais lu pour deviner une variable.
 */
@Injectable()
export class OutreachMessageVariablesService {
  constructor(
    @InjectRepository(OutreachMessageEntity)
    private readonly messages: Repository<OutreachMessageEntity>,
    @InjectRepository(OutreachMessageVariableEntity)
    private readonly variables: Repository<OutreachMessageVariableEntity>,
  ) {}

  async set(
    ctx: OutreachCtx,
    messageId: string,
    input: SetOutreachMessageVariableRequest,
  ): Promise<OutreachMessageVariable> {
    const message = await this.owned(ctx, messageId)
    const existing = await this.variables.findOne({
      where: { message_id: message.id, version: message.current_version, name: input.name },
    })
    const row = existing
      ? { ...existing, ...input, declared_by: ctx.userId }
      : this.variables.create({
          workspace_id: ctx.workspaceId,
          message_id: message.id,
          version: message.current_version,
          declared_by: ctx.userId,
          ...input,
        })
    return toWire(await this.variables.save(row))
  }

  async list(ctx: OutreachCtx, messageId: string): Promise<OutreachMessageVariable[]> {
    const message = await this.owned(ctx, messageId)
    const rows = await this.variables.find({
      where: { workspace_id: ctx.workspaceId, message_id: message.id, version: message.current_version },
      order: { name: 'ASC' },
    })
    return rows.map(toWire)
  }

  private async owned(ctx: OutreachCtx, id: string): Promise<OutreachMessageEntity> {
    const message = await this.messages.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!message) throw new NotFoundException('Message introuvable.')
    return message
  }
}

function toWire(row: OutreachMessageVariableEntity): OutreachMessageVariable {
  return {
    id: row.id,
    message_id: row.message_id,
    version: row.version,
    name: row.name,
    value: row.value,
    source: row.source,
    as_of: typeof row.as_of === 'string' ? row.as_of.slice(0, 10) : new Date(row.as_of).toISOString().slice(0, 10),
    confidence: row.confidence,
    external_use: row.external_use,
    declared_by: row.declared_by,
    declared_at: new Date(row.declared_at).toISOString(),
  }
}
