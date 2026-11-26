import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import { ConnectorCapabilityIncidentLogEntity } from '../../database/entities/connector-capability-incident-log.entity'

export type ConnectorIncidentImpact = { ok: true; workspacesTouched: number } | { ok: false }

export type ConnectorIncidentLogView = {
  id: string
  kind: 'action' | 'communication'
  workspaceId: string | null
  note: string
  createdAt: string
}

/**
 * #2445.12 (épopée #2766, lot SRC5 28/09 soir) — L'IMPACT, LES ACTIONS, LA
 * COMMUNICATION D'UN INCIDENT.
 *
 * La chronologie (`connector_capability_incidents`, lue par
 * `OperatorHealthService`) date QUAND une capacité a cessé, ou repris, de
 * répondre. Ce service tient les TROIS parts qui restaient hors de cette
 * tranche, tel que son propre docblock le disait :
 *
 *  - {@link impactOf} — combien d'ESPACES le MÊME incident touche,
 *    COMPTÉS jamais NOMMÉS (doctrine — nos fournisseurs et les espaces
 *    d'AUTRES clients ne se nomment jamais à l'écran d'un opérateur) ;
 *  - {@link logAction} / {@link logCommunication} — le journal append-only
 *    de ce qu'un opérateur a FAIT et DIT sur cet incident.
 *
 * Repositories injectés DIRECTEMENT (GA-07 ne les compte pas), déclarés dans
 * `tool-registry.module.ts` (GA-20) — même patron que `ConnectorProbeService`.
 */
@Injectable()
export class ConnectorIncidentOpsService {
  constructor(
    @InjectRepository(ConnectorCapabilityIncidentEntity)
    private readonly incidents: Repository<ConnectorCapabilityIncidentEntity>,
    @InjectRepository(ConnectorCapabilityIncidentLogEntity)
    private readonly logs: Repository<ConnectorCapabilityIncidentLogEntity>,
  ) {}

  /**
   * Combien d'espaces DISTINCTS ont une transition `degraded` pour le MÊME
   * fournisseur + capacité, dans la fenêtre de CET incident (de son
   * `occurred_at` jusqu'à la prochaine `recovered` de la même capacité, ou
   * maintenant si elle n'a pas encore repris). `null` (l'anchor n'existe pas,
   * ou n'est pas un DÉBUT d'incident) rend `{ ok: false }` — jamais un compte
   * inventé.
   */
  async impactOf(incidentId: string): Promise<ConnectorIncidentImpact> {
    const anchor = await this.incidents.findOne({ where: { id: incidentId, transition: 'degraded' } })
    if (!anchor) return { ok: false }

    const recovery = await this.incidents
      .createQueryBuilder('i')
      .where('i.provider = :provider', { provider: anchor.provider })
      .andWhere('i.capability = :capability', { capability: anchor.capability })
      .andWhere("i.transition = 'recovered'")
      .andWhere('i.occurred_at > :start', { start: anchor.occurred_at })
      .orderBy('i.occurred_at', 'ASC')
      .getOne()
    const windowEnd = recovery?.occurred_at ?? new Date()

    const { count } = (await this.incidents
      .createQueryBuilder('i')
      .select('COUNT(DISTINCT i.workspace_id)', 'count')
      .where('i.provider = :provider', { provider: anchor.provider })
      .andWhere('i.capability = :capability', { capability: anchor.capability })
      .andWhere("i.transition = 'degraded'")
      .andWhere('i.occurred_at >= :start', { start: anchor.occurred_at })
      .andWhere('i.occurred_at <= :end', { end: windowEnd })
      .getRawOne<{ count: string }>()) ?? { count: '0' }

    return { ok: true, workspacesTouched: Number(count) }
  }

  async logAction(incidentId: string, note: string, actor: string | null): Promise<ConnectorIncidentLogView> {
    await this.assertIncidentExists(incidentId)
    const row = await this.logs.save(
      this.logs.create({ incident_id: incidentId, kind: 'action', workspace_id: null, actor, note }),
    )
    return toView(row)
  }

  async logCommunication(
    incidentId: string,
    note: string,
    workspaceId: string | null,
    actor: string | null,
  ): Promise<ConnectorIncidentLogView> {
    await this.assertIncidentExists(incidentId)
    const row = await this.logs.save(
      this.logs.create({ incident_id: incidentId, kind: 'communication', workspace_id: workspaceId, actor, note }),
    )
    return toView(row)
  }

  /** Le journal complet, du plus ancien au plus récent — un fait ne se réordonne jamais. */
  async listLogs(incidentId: string): Promise<ConnectorIncidentLogView[]> {
    const rows = await this.logs.find({ where: { incident_id: incidentId }, order: { created_at: 'ASC' } })
    return rows.map(toView)
  }

  private async assertIncidentExists(incidentId: string): Promise<void> {
    const anchor = await this.incidents.findOne({ where: { id: incidentId, transition: 'degraded' } })
    if (!anchor) throw new NotFoundException('incident_not_found')
  }
}

function toView(row: ConnectorCapabilityIncidentLogEntity): ConnectorIncidentLogView {
  return {
    id: row.id,
    kind: row.kind,
    workspaceId: row.workspace_id,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  }
}
