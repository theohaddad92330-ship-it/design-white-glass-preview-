import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { z } from 'zod'
import type { AccountQualificationView, QualificationGrid, QualificationGridImportReport } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import {
  QualificationGridService,
  type QualificationCtx,
  type QualificationEvaluationOutcome,
} from './qualification-grid.service'

/** Un classeur importé : xlsx en base64 (même convention que `intake/zip`) ou csv en texte. */
const importGridSchema = z.object({
  format: z.enum(['xlsx', 'csv']),
  content: z.string().min(1).max(5_000_000),
  // #4426.4 — l'onglet reconnu par le pack de contexte ; absent = le premier.
  sheet: z.string().min(1).max(255).optional(),
})
type ImportGridBody = z.infer<typeof importGridSchema>

/** Code de critère dans l'URL : la même forme que dans le contrat. */
const CODE_PARAM_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/

/**
 * #3755 — la surface HTTP de la grille de qualification. Espace résolu depuis le
 * TOKEN (GA-07), jamais depuis le corps ni l'URL.
 *
 * - lire la grille et la qualification d'un compte : tout membre ;
 * - poser / importer la grille : `team:manage` (elle change le verdict de TOUS) ;
 * - corriger un critère d'un compte : `records:write` ;
 * - relancer l'évaluation (un appel modèle) : `analysis:run`.
 */
@Controller('qualification-grid')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class QualificationGridController {
  constructor(
    private readonly qualification: QualificationGridService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<QualificationCtx> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId }
  }

  private code(raw: string): string {
    if (!CODE_PARAM_RE.test(raw)) throw new BadRequestException('Code de critère invalide')
    return raw
  }

  @Get()
  @WorkspaceRead()
  async active(@CurrentUser() user: CurrentUserPayload): Promise<{ grid: QualificationGrid | null }> {
    const { workspaceId } = await this.ctx(user)
    return { grid: await this.qualification.getActiveGrid(workspaceId) }
  }

  @Put()
  @RequirePermission('team:manage')
  async save(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload): Promise<QualificationGrid> {
    return this.qualification.saveGrid(await this.ctx(user), body)
  }

  @Post('import')
  @RequirePermission('team:manage')
  async import(
    @Body(new ZodValidationPipe(importGridSchema)) body: ImportGridBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<QualificationGrid & { import_report: QualificationGridImportReport }> {
    return this.qualification.importGrid(await this.ctx(user), body)
  }

  /**
   * #3749 — le verdict de la grille pour TOUT le portefeuille, une lecture.
   * Même mécanisme que `GET /accounts/access-summary` : un verdict par
   * compte, jamais un recalcul (voir `QualificationGridService.accountsSummary`).
   */
  @Get('accounts-summary')
  @WorkspaceRead()
  async accountsSummary(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ accountId: string; verdict: 'GO' | 'PRUDENT' | 'NO-GO' | null }[]> {
    const { workspaceId } = await this.ctx(user)
    return this.qualification.accountsSummary(workspaceId)
  }

  @Get('accounts/:accountId')
  @WorkspaceRead()
  async account(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ qualification: AccountQualificationView | null }> {
    return { qualification: await this.qualification.getAccountQualification(await this.ctx(user), accountId) }
  }

  @Put('accounts/:accountId/criteria/:code')
  @RequirePermission('records:write')
  async setManual(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('code') code: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ qualification: AccountQualificationView | null }> {
    const ctx = await this.ctx(user)
    return { qualification: await this.qualification.setManualEvaluation(ctx, accountId, this.code(code), body) }
  }

  @Delete('accounts/:accountId/criteria/:code')
  @RequirePermission('records:write')
  async clearManual(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('code') code: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ qualification: AccountQualificationView | null }> {
    const ctx = await this.ctx(user)
    return { qualification: await this.qualification.clearManualEvaluation(ctx, accountId, this.code(code)) }
  }

  @Post('accounts/:accountId/evaluate')
  @RequirePermission('analysis:run')
  async evaluate(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ status: QualificationEvaluationOutcome; qualification: AccountQualificationView | null }> {
    const ctx = await this.ctx(user)
    // Le compte doit être de l'espace AVANT tout appel modèle (404 sinon).
    await this.qualification.getAccountQualification(ctx, accountId)
    const status = await this.qualification.evaluateFromAnalysis(accountId, ctx.workspaceId)
    return { status, qualification: await this.qualification.getAccountQualification(ctx, accountId) }
  }
}
