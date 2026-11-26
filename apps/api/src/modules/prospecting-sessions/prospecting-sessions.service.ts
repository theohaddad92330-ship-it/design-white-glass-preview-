import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  aggregateProspectingSessionMetrics,
  type ProspectingSessionMetric,
  type ProspectingSessionRecord,
  type RecordProspectingSessionEventRequest,
} from '@bellum/contracts'
import { ProspectingSessionEntity } from '../../database/entities/prospecting-session.entity'

/**
 * #2386.9 — le SEUL écrivain de `prospecting_sessions` (GA-26). L'agrégat
 * (`getMetrics`) délègue le calcul à `aggregateProspectingSessionMetrics`
 * (`@bellum/contracts`, pure et testée) : ce service ne fait que LIRE les
 * lignes et les convertir en `ProspectingSessionRecord` — aucune moyenne,
 * aucun taux ne se calcule ici une seconde fois.
 */
@Injectable()
export class ProspectingSessionsService {
  constructor(
    @InjectRepository(ProspectingSessionEntity)
    private readonly sessions: Repository<ProspectingSessionEntity>,
  ) {}

  async start(workspaceId: string | null, journey: string): Promise<string> {
    const created = await this.sessions.save(this.sessions.create({ workspace_id: workspaceId, journey }))
    return created.id
  }

  /**
   * Best-effort, jamais bloquant côté appelant : une session déjà close ou un
   * identifiant périmé ne doit jamais casser l'écran qui vient de terminer
   * un envoi. `NotFoundException` reste levée — c'est au contrôleur/appelant
   * HTTP de l'avaler s'il le juge best-effort, jamais ce service en silence
   * (« une garde protège une règle, elle ne l'invente pas »).
   */
  async recordEvent(id: string, event: RecordProspectingSessionEventRequest): Promise<void> {
    const session = await this.sessions.findOne({ where: { id } })
    if (!session) throw new NotFoundException('prospecting session introuvable')

    switch (event.kind) {
      case 'first_message':
        if (!session.first_message_at) session.first_message_at = new Date()
        break
      case 'message_sent':
        session.messages_total += 1
        if (event.modified) session.messages_modified += 1
        break
      case 'connector_attempt':
        session.connector_attempts += 1
        if (event.success) session.connector_successes += 1
        break
      case 'duplicates_avoided':
        session.duplicates_avoided += event.count
        break
    }
    await this.sessions.save(session)
  }

  async getMetrics(workspaceId: string | null): Promise<ProspectingSessionMetric[]> {
    const rows = await this.sessions.find({
      where: workspaceId ? { workspace_id: workspaceId } : {},
    })
    const records: ProspectingSessionRecord[] = rows.map(row => ({
      journey: row.journey,
      startedAt: row.started_at.toISOString(),
      firstMessageAt: row.first_message_at ? row.first_message_at.toISOString() : null,
      messagesTotal: row.messages_total,
      messagesModified: row.messages_modified,
      connectorAttempts: row.connector_attempts,
      connectorSuccesses: row.connector_successes,
      duplicatesAvoided: row.duplicates_avoided,
    }))
    return aggregateProspectingSessionMetrics(records)
  }
}
