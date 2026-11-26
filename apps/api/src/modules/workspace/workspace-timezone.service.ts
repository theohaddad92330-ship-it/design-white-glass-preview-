import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { WorkspaceTimezoneResolution } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * #1958.2 — Resolves and mutates the *timezone* of the caller's active
 * workspace. Mirrors {@link WorkspaceMarketService} on purpose: same shape of
 * problem (a workspace-level setting, read by any member, written by
 * owner/admin only), and a reader should not have to learn a second pattern.
 *
 * `null` = this workspace never set one — never a guess, never UTC. It is read
 * by `resolve_applicable_timezone` (`apps/ia/app/prompts/current_time.py`) in
 * LAST resort before the named product default: person → appointment (#1958.3)
 * → workspace → product default (GA-26 — a single derivation).
 */
@Injectable()
export class WorkspaceTimezoneService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** `GET /workspaces/timezone` — any member may read it. */
  async getTimezone(userId: string): Promise<WorkspaceTimezoneResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.resolveForWorkspace(workspaceId)
  }

  /**
   * Resolve the timezone for a specific workspace id — used by the chat
   * context (which already holds the caller's `workspace_id`). A missing row
   * or an empty column degrades to `null` (never throws on the hot path).
   */
  async resolveForWorkspace(workspaceId: string | null | undefined): Promise<WorkspaceTimezoneResolution> {
    if (!workspaceId) return { timezone: null }
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return { timezone: workspace?.timezone?.trim() || null }
  }

  /**
   * `PATCH /workspaces/timezone` — persist a new timezone (or clear it back to
   * `null`) for the active workspace. Owner/admin only, same gate as
   * {@link WorkspaceMarketService.setMarket} — members read but do not change
   * the team-wide setting.
   */
  async setTimezone(userId: string, timezone: string | null): Promise<WorkspaceTimezoneResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    const result = await this.workspaces.update({ id: workspaceId }, { timezone })
    if (result.affected === 0) throw new NotFoundException('Espace de travail introuvable')

    return { timezone }
  }
}
