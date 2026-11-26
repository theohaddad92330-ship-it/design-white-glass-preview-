import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { computeSendTiming, type SendTiming, type SendTimingObservation } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'

/** Borne de lecture : les gestes faits les plus récents. Une mesure de timing
 *  vieillit — ce qui a été fait il y a un an ne dit rien du créneau d'aujourd'hui. */
const OBSERVATION_LIMIT = 2000

type ObservationRow = {
  channel: string | null
  completed_at: Date | string
  outcome: string | null
  contact_timezone: string | null
  contact_seniority: string | null
}

/**
 * #3289 (#3264.31/.32/.33) — le TIMING appris, par espace.
 *
 * Lit les gestes FAITS (`action_plan_items`, déjà horodatés, avec canal et
 * issue déclarée) du workspace et les confie au calcul pur de
 * `@bellum/contracts` (`computeSendTiming`). Aucune table nouvelle : la brique
 * que les lots précédents jugeaient absente était ici depuis
 * `ActionPlanItemChannel` + `ActionPlanItemOutcome`.
 *
 * Appelé par `GET /plan-items/send-timing` (web) et par le pont Laura
 * (`POST /internal/copilot/outreach/send-timing`).
 */
@Injectable()
export class SendTimingService {
  private readonly logger = new Logger(SendTimingService.name)

  constructor(
    @InjectRepository(ActionPlanItemEntity)
    private readonly items: Repository<ActionPlanItemEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** `null` = lecture impossible : un échec n'est jamais rendu comme « rien à recommander ». */
  async forWorkspace(workspaceId: string, seniority?: string): Promise<SendTiming | null> {
    try {
      const rows = await this.items
        .createQueryBuilder('item')
        .innerJoin('accounts', 'account', 'account.id = item.account_id')
        .leftJoin('contacts', 'contact', 'contact.id = item.contact_id')
        .select([
          'item.channel AS channel',
          'item.completed_at AS completed_at',
          'item.outcome AS outcome',
          'contact.timezone AS contact_timezone',
          'contact.seniority AS contact_seniority',
        ])
        .where("item.execution_status = 'done'")
        .andWhere('item.completed_at IS NOT NULL')
        .andWhere('item.channel IS NOT NULL')
        .andWhere('item.outcome IS NOT NULL')
        .andWhere('account.workspace_id = :workspaceId', { workspaceId })
        .orderBy('item.completed_at', 'DESC')
        .limit(OBSERVATION_LIMIT)
        .getRawMany<ObservationRow>()

      const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
      const observations: SendTimingObservation[] = rows.map(row => ({
        channel: row.channel,
        at: new Date(row.completed_at).toISOString(),
        contactTimezone: row.contact_timezone ?? null,
        outcome: row.outcome,
        seniority: row.contact_seniority ?? null,
      }))
      return computeSendTiming(observations, {
        workspaceTimezone: workspace?.timezone ?? null,
        ...(seniority ? { seniority } : {}),
      })
    } catch (err) {
      this.logger.warn('send timing failed', { error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }
}
