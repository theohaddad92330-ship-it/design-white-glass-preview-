import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { hasPermission, type PipeByOwner, type PipeInspection, type PipeWaterfall } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PipeService } from './pipe.service'

const isoDate = z.string().date()
/** `from`/`to` (jours ISO) ; absents = le mois en cours, du premier jour à maintenant. */
class PipePeriodQueryDto extends createZodDto(z.object({ from: isoDate.optional(), to: isoDate.optional() })) {}

/** Fin de journée UTC : « jusqu'au 14 » inclut le 14. */
const endOfDay = (day: string): Date => new Date(`${day}T23:59:59.999Z`)

/**
 * `/pilotage/pipe` — la section Pipe de Pilotage (L2). Même porte d'offre que le cockpit
 * (`manager_cockpit`). Lecture pure, NON PONDÉRÉE, scopée au workspace actif de l'appelant.
 *
 * CHACUN SON PIPE (Louis 22/10/2026, Q5) : l'inspection et le waterfall sont ouverts à tout membre,
 * bornés à SES affaires (lecture du CRM : `crm:read`) ; un gestionnaire (`team:manage`) lit l'équipe. Le classement par commercial
 * (`by-owner`) reste une donnée d'ÉQUIPE : `team:manage`.
 */
@Controller('pilotage/pipe')
@RequireFeature('manager_cockpit')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class PipeController {
  constructor(
    private readonly pipe: PipeService,
    // Résolu ICI et non dans le service : un contrôleur est exempté du cliquet GA-07.
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** La table d'inspection : opportunités ouvertes, signaux de risque, totaux par catégorie déclarée. */
  @Get('inspection')
  @RequirePermission('crm:read')
  async inspection(@CurrentUser() user: CurrentUserPayload): Promise<PipeInspection> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipe.inspection(workspaceId, undefined, hasPermission(role, 'team:manage') ? undefined : user.userId)
  }

  /** Le waterfall du pipe sur la période : ouverture → … → clôture, non pondéré. */
  @Get('waterfall')
  @RequirePermission('crm:read')
  async waterfall(@CurrentUser() user: CurrentUserPayload, @Query() query: PipePeriodQueryDto): Promise<PipeWaterfall> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipe.waterfall(
      workspaceId,
      query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
      query.to ? endOfDay(query.to) : undefined,
      undefined,
      hasPermission(role, 'team:manage') ? undefined : user.userId,
    )
  }

  /** Pipe ouvert, signé de la période, taux de gain 90 j, cycle médian 180 j — par commercial. */
  @Get('by-owner')
  @RequirePermission('team:manage')
  async byOwner(@CurrentUser() user: CurrentUserPayload, @Query() query: PipePeriodQueryDto): Promise<PipeByOwner> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipe.byOwner(
      workspaceId,
      query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
      query.to ? endOfDay(query.to) : undefined,
    )
  }
}
