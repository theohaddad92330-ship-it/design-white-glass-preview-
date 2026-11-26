import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  EMPTY_TEAM_POLICY,
  isTeamPolicySet,
  teamPolicySchema,
  type TeamPolicy,
  type TeamPolicyWindow,
  type UpdateTeamPolicy,
} from '@bellum/contracts'
import { WorkspaceTeamPolicySettingsEntity } from '../../database/entities/workspace-team-policy-settings.entity'

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE : LE SEUL SERVICE DU SUJET (GA-26).
 *
 * Écrite par l'écran Réglages › Équipe (`PATCH /workspaces/team-policy`, sous
 * `team:manage`), lue par le même écran et par Laura (`forLaura`, pont
 * `internal/copilot/workspace/team-policy`) quand elle organise une journée ou
 * une semaine. Aucune ligne = la politique vide, que Laura dit « aucune
 * politique d'équipe saisie » — jamais une règle devinée.
 */
@Injectable()
export class WorkspaceTeamPolicySettingsService {
  private readonly logger = new Logger(WorkspaceTeamPolicySettingsService.name)

  constructor(
    @InjectRepository(WorkspaceTeamPolicySettingsEntity)
    private readonly settings: Repository<WorkspaceTeamPolicySettingsEntity>,
  ) {}

  /** La politique en vigueur, ou la politique vide. Une lecture en panne retombe sur « rien saisi ». */
  async effectiveFor(workspaceId: string): Promise<TeamPolicy> {
    try {
      const row = await this.settings.findOne({ where: { workspace_id: workspaceId } })
      if (!row) return EMPTY_TEAM_POLICY
      return {
        prospectingWindows: readWindows(row.prospecting_windows),
        forbiddenWindows: readWindows(row.forbidden_windows),
        maxMeetingsPerDay: row.max_meetings_per_day ?? null,
        dailyCallTarget: row.daily_call_target ?? null,
      }
    } catch (error) {
      this.logger.error('team policy read failed', { error })
      return EMPTY_TEAM_POLICY
    }
  }

  /** Pour Laura : `policy: null` quand rien n'est saisi — c'est ce qu'elle dit, distinct d'un pont muet. */
  async forLaura(workspaceId: string): Promise<{ policy: TeamPolicy | null }> {
    const policy = await this.effectiveFor(workspaceId)
    return { policy: isTeamPolicySet(policy) ? policy : null }
  }

  /** Poser la politique : un champ omis ne bouge pas ; la politique FUSIONNÉE est revalidée en entier. */
  async update(workspaceId: string, userId: string, patch: UpdateTeamPolicy): Promise<TeamPolicy> {
    const current = await this.effectiveFor(workspaceId)
    const parsed = teamPolicySchema.safeParse({ ...current, ...patch })
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'politique d’équipe invalide')
    }
    const next = parsed.data
    await this.settings.manager.query(
      `INSERT INTO workspace_team_policy_settings
         (workspace_id, prospecting_windows, forbidden_windows, max_meetings_per_day, daily_call_target, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, now())
       ON CONFLICT (workspace_id) DO UPDATE
         SET prospecting_windows = EXCLUDED.prospecting_windows,
             forbidden_windows = EXCLUDED.forbidden_windows,
             max_meetings_per_day = EXCLUDED.max_meetings_per_day,
             daily_call_target = EXCLUDED.daily_call_target,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [
        workspaceId,
        JSON.stringify(next.prospectingWindows),
        JSON.stringify(next.forbiddenWindows),
        next.maxMeetingsPerDay,
        next.dailyCallTarget,
        userId,
      ],
    )
    return next
  }
}

/** Une plage illisible (écrite hors contrat) est écartée, jamais réinterprétée. */
function readWindows(raw: unknown): TeamPolicyWindow[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (window): window is TeamPolicyWindow =>
      typeof window?.startMinute === 'number' &&
      typeof window?.endMinute === 'number' &&
      window.startMinute >= 0 &&
      window.endMinute <= 1440 &&
      window.endMinute > window.startMinute,
  )
}
