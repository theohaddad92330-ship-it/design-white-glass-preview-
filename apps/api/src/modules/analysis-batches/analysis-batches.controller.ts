import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AnalysisService } from '../analysis/analysis.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { CompaniesService } from '../companies/companies.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ConfirmAnalysisBatchItemDto, CreateAnalysisBatchDto } from './dto/analysis-batches.dto'
import { AnalysisBatchesService, type AnalysisBatchPorts } from './analysis-batches.service'

/**
 * #2293 (LAU-FINAL-034) — le lot d'analyses multi-comptes.
 *
 * La PRÉVIEW est une lecture (rien n'est lancé ni débité) mais porte quand même
 * `analysis:run` : elle n'a de sens que pour qui peut lancer, et elle interroge
 * le registre. Les quatre gestes qui LANCENT ou ARRÊTENT (créer, reprendre,
 * confirmer, annuler) portent `analysis:run`, comme `POST /analysis/start`.
 */
@Controller('analysis-batches')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AnalysisBatchesController {
  constructor(
    private readonly batches: AnalysisBatchesService,
    private readonly analysis: AnalysisService,
    private readonly companies: CompaniesService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly businessUnits: BusinessUnitService,
  ) {}

  /**
   * GA-07 — l'orchestration vit AU BORD : le lot emprunte l'analyse unitaire
   * (devis, lancement, état, annulation) et la résolution d'un nom, avec le
   * périmètre de l'appelant résolu ICI une fois — `resolveBusinessUnitScope`
   * LÈVE plutôt que d'ouvrir l'espace entier (fail-closed, #2704).
   */
  private async ports(userId: string): Promise<AnalysisBatchPorts> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const scope = {
      workspaceId,
      businessUnitScope: await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
    }
    return {
      workspaceId,
      isDemo: () => this.workspaceContext.isDemoWorkspace(userId),
      planLaunch: (params, caller) => this.analysis.planLaunch(params, caller),
      start: (dto, caller) => this.analysis.start(dto, caller),
      getStatus: (accountId, caller) => this.analysis.getStatus(accountId, caller, scope),
      cancel: (accountId, caller) => this.analysis.cancelByUser(accountId, caller, scope),
      searchCompanies: (q, limit) => this.companies.search(q, limit),
    }
  }

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4671 — la liste relit les sous-jobs en vol (ports de l'appelant), sinon « 1 en cours » reste affiché à jamais.
    return this.batches.list(workspaceId, undefined, { ports: await this.ports(user.userId), userId: user.userId })
  }

  @Post('preview')
  @RequirePermission('analysis:run')
  async preview(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateAnalysisBatchDto) {
    return this.batches.preview(await this.ports(user.userId), user.userId, body)
  }

  @Post()
  @RequirePermission('analysis:run')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateAnalysisBatchDto) {
    return this.batches.create(await this.ports(user.userId), user.userId, body)
  }

  @Get(':id')
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.get(await this.ports(user.userId), user.userId, id)
  }

  @Post(':id/cancel')
  @RequirePermission('analysis:run')
  async cancel(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.cancel(await this.ports(user.userId), user.userId, id)
  }

  @Post(':id/retry')
  @RequirePermission('analysis:run')
  async retry(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.retry(await this.ports(user.userId), user.userId, id)
  }

  @Post(':id/items/:itemId/confirm')
  @RequirePermission('analysis:run')
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: ConfirmAnalysisBatchItemDto,
  ) {
    return this.batches.confirm(await this.ports(user.userId), user.userId, id, itemId, body.siren)
  }

  /** #2283.32 — l'AUTRE issue d'une ambiguïté : exclure ce sous-job du lot. */
  @Post(':id/items/:itemId/exclude')
  @RequirePermission('analysis:run')
  async exclude(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.batches.exclude(await this.ports(user.userId), user.userId, id, itemId)
  }
}
