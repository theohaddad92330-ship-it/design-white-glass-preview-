import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { normalizeMarket, resolveMarket, type WorkspaceMarket, type WorkspaceMarketResolution } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * Resolves and mutates the *target market* of the caller's active workspace.
 *
 * A market (`FR`/`CH`/`BE`/`LU`/`US`/`CA`) is the single product-level knob that decides,
 * for every run in the workspace, which country the analysis targets. This
 * service is the one place that turns the stored `workspaces.market` code into
 * the full {@link WorkspaceMarketResolution} the rest of the app consumes:
 *
 *  - the web selector reads it to show the current market + its consequences;
 *  - the analysis enqueue path reads `countryCode` to propagate `country` to the
 *    IA (the param the country packs expect) — see {@link resolveForWorkspace}.
 *
 * **FR is the strictly-unchanged default**: an absent/unknown stored value
 * normalises to `FR`, whose resolution carries no country pack, so the French
 * path is byte-identical to before this feature existed.
 */
@Injectable()
export class WorkspaceMarketService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** `GET /workspaces/market` — the resolved market of the active workspace.
   *  Any member may read it. */
  async getMarket(userId: string): Promise<WorkspaceMarketResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.resolveForWorkspace(workspaceId)
  }

  /**
   * Resolve the market for a specific workspace id — used by the analysis
   * enqueue path, which already holds the run's `workspace_id`. A missing row or
   * a malformed stored value degrades to `FR` (never throws on the hot path).
   */
  async resolveForWorkspace(workspaceId: string | null | undefined): Promise<WorkspaceMarketResolution> {
    if (!workspaceId) return resolveMarket('FR')
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return resolveMarket(normalizeMarket(workspace?.market))
  }

  /**
   * `PATCH /workspaces/market` — persist a new market for the active workspace.
   * Owner/admin only (members read but do not change the team-wide setting).
   * Returns the freshly-resolved view so the client can render the consequences
   * (locale / sources / legal basis) without a second round-trip.
   */
  async setMarket(userId: string, market: WorkspaceMarket): Promise<WorkspaceMarketResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    const result = await this.workspaces.update({ id: workspaceId }, { market })
    if (result.affected === 0) throw new NotFoundException('Espace de travail introuvable')

    return resolveMarket(market)
  }
}
