import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  createAccountPartnerSchema,
  dismissAccountPartnerSchema,
  qualifyAccountPartnerSchema,
  type AccountPartner,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PartnersService, type PartnerLandscape } from './partners.service'

class CreateAccountPartnerDto extends createZodDto(createAccountPartnerSchema) {}
class DismissAccountPartnerDto extends createZodDto(dismissAccountPartnerSchema) {}
class QualifyAccountPartnerDto extends createZodDto(qualifyAccountPartnerSchema) {}

/**
 * Les ESN présentes sur un compte (décision D11). Lecture ouverte à l'espace —
 * savoir qui tient un compte est précisément ce qu'une équipe doit partager.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get(':id/partners')
  async landscape(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<PartnerLandscape> {
    return this.partners.landscape(await this.workspaceOf(user.userId), accountId, user.userId)
  }

  @Post(':id/partners')
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateAccountPartnerDto,
  ): Promise<AccountPartner> {
    // #2298.7 — QUI déclare : `user.userId` porte l'acteur, jamais reconstitué
    // après coup.
    return this.partners.create(await this.workspaceOf(user.userId), accountId, dto, user.userId)
  }

  /**
   * #2122.46 — « Qualifier » une ESN que l'espace connaît déjà : dire son rang
   * et de quel côté elle est. `POST :id/partners` ne le permettait pas — il
   * refuse un nom déjà présent — et les deux CTA positifs de l'onglet étaient
   * rendus derrière un prédicat que la liste canonique ne peut pas satisfaire
   * (voir `partners-qualify.spec.ts`). Même permission que la saisie : celui
   * qui travaille le compte est celui qui sait.
   */
  @Patch('partners/:partnerId')
  @RequirePermission('records:write')
  async qualify(
    @CurrentUser() user: CurrentUserPayload,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: QualifyAccountPartnerDto,
  ): Promise<AccountPartner> {
    return this.partners.qualify(await this.workspaceOf(user.userId), partnerId, dto)
  }

  /** Écarter une ESN que l'analyse a cru voir. Ouvert à `records:write` comme
   *  la saisie : celui qui découvre l'erreur est celui qui travaille le compte. */
  @Post('partners/:partnerId/dismiss')
  @RequirePermission('records:write')
  async dismiss(
    @CurrentUser() user: CurrentUserPayload,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: DismissAccountPartnerDto,
  ): Promise<AccountPartner> {
    return this.partners.dismiss(await this.workspaceOf(user.userId), partnerId, dto.reason)
  }

  @Delete('partners/:partnerId')
  @RequirePermission('records:write')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
  ): Promise<{ deleted: true }> {
    return this.partners.remove(await this.workspaceOf(user.userId), partnerId)
  }
}
