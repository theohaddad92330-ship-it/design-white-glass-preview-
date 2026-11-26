import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards, BadRequestException } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { saveMonthPreparationSchema, type InvoiceMonthPreparation } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { InvoiceMonthPreparationService } from './invoice-month-preparation.service'

class SaveMonthPreparationDto extends createZodDto(saveMonthPreparationSchema) {}
class AutoPrepareDto extends createZodDto(z.object({ enabled: z.boolean() }).strict()) {}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function assertMonth(month: string): string {
  if (!MONTH.test(month)) throw new BadRequestException('Format attendu : AAAA-MM')
  return month
}

/**
 * #2563 / #2566 / #2567 — la facture mensuelle reconduite d'une mission longue.
 * Lire = `finance:read` (le montant et le bon de commande sont des données
 * financières) ; préparer = `finance:write`.
 */
@Controller('delivery/invoice-preparation')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class InvoiceMonthPreparationController {
  constructor(
    private readonly preparations: InvoiceMonthPreparationService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get(':missionId/:month')
  @RequirePermission('finance:read')
  async preview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('month') month: string,
  ): Promise<InvoiceMonthPreparation> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.preparations.preview(workspaceId, missionId, assertMonth(month))
  }

  @Put(':missionId/auto')
  @RequirePermission('finance:write')
  async setAuto(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: AutoPrepareDto,
  ): Promise<{ enabled: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.preparations.setAutoPrepare(workspaceId, user.userId, missionId, body.enabled)
  }

  @Put(':missionId/:month')
  @RequirePermission('finance:write')
  async save(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('month') month: string,
    @Body() body: SaveMonthPreparationDto,
  ): Promise<InvoiceMonthPreparation> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.preparations.save(workspaceId, user.userId, missionId, assertMonth(month), body)
  }
}
