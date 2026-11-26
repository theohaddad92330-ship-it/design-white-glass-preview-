import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common'
import { isFailure } from '@bellum/utils'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisService } from '../analysis/analysis.service'
import {
  AdminAnalysesService,
  type AdminAnalysesHeatmap,
  type AdminAnalysesList,
  type AdminAnalysisAudit,
} from './admin-analyses.service'
import { AdminStopAnalysisDto } from './dto/admin-stop-analysis.dto'
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto'

/**
 * Operator analysis-monitoring API — cross-user run list, per-run "full audit"
 * detail, and the admin STOP / force-error control. Sibling of {@link
 * InternalAdminController} / {@link AdminOpsController}: same `internal/admin`
 * prefix, same `InternalSecretGuard` (header secret, no end-user JWT), so
 * everything here is cross-tenant by design — the guard is the only thing
 * between this and every user's analyses. It must never be removed.
 *
 * Reads go through {@link AdminAnalysesService}; the STOP / force-error mutation
 * reuses {@link AnalysisService.cancelByAdmin} — the SAME cancellation machinery
 * the user-cancel path uses, never a second cancel implementation.
 */
@Controller('internal/admin/analyses')
@UseGuards(InternalSecretGuard)
export class AdminAnalysesController {
  constructor(
    private readonly analyses: AdminAnalysesService,
    private readonly analysisService: AnalysisService,
  ) {}

  @Get()
  list(@Query() query: ListAnalysesQueryDto): Promise<AdminAnalysesList> {
    return this.analyses.listAnalyses({
      search: query.search,
      status: query.status,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    })
  }

  /**
   * « Quand le produit est utilisé » (#1650) — analyses launched per day × hour
   * over a sliding 7-day window, in the console's time zone.
   *
   * ⚠️ Declared BEFORE `:accountId/audit` on purpose. It is a literal one-segment
   * route and the audit takes two, so nothing can capture it today; keeping the
   * literal first is what stops the next parameterised route from doing so.
   *
   * The read instant is passed IN rather than reached for down the stack: the
   * whole window derivation is pure and testable that way.
   */
  @Get('heatmap')
  heatmap(): Promise<AdminAnalysesHeatmap> {
    return this.analyses.getLaunchHeatmap(new Date())
  }

  @Get(':accountId/audit')
  async audit(@Param('accountId') accountId: string): Promise<AdminAnalysisAudit> {
    const audit = await this.analyses.getAudit(accountId)
    if (!audit) {
      throw new NotFoundException(`Analysis ${accountId} not found`)
    }
    return audit
  }

  /**
   * Stop / force-error ANY user's analysis. `mode: 'stop'` (default) cancels a
   * live run via the shared cancellation path; `mode: 'force_error'` frees a
   * zombie `analyzing` row that no longer has a live job. Audit-logged inside
   * `cancelByAdmin` (who / what / when). Always 200 on success with the new
   * status; 404 when the account doesn't exist.
   */
  @Post(':accountId/stop')
  async stop(
    @Param('accountId') accountId: string,
    @Body() dto: AdminStopAnalysisDto,
  ): Promise<{ accountId: string; status: 'canceled' | 'error'; ownerUserId: string }> {
    const result = await this.analysisService.cancelByAdmin(accountId, dto.mode ?? 'stop', dto.actor ?? 'backoffice')
    if (isFailure(result)) {
      throw new NotFoundException(result.problem.message)
    }
    return result.output
  }
}
