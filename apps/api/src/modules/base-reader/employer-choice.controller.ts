import { Body, Controller, Put, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { BaseReaderService } from './base-reader.service'
import { EmployerChoiceDto } from './dto/base-reader-choice.dto'

/**
 * #4419.8 — « Choisir l'entreprise » sur une ligne « Plusieurs entreprises portent ce nom » de Découvrir.
 *
 * ÉCRITURE : réservée aux membres qui peuvent ajouter un compte (`records:write`), posée sous l'espace ACTIF de
 * l'appelant — jamais sous un espace donné par le client. Le choix ne se lit que dans cet espace (`identityByName`).
 */
@Controller('discover/employer-choice')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class EmployerChoiceController {
  constructor(
    private readonly reader: BaseReaderService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Put()
  @RequirePermission('records:write')
  async choose(@CurrentUser() user: CurrentUserPayload, @Body() dto: EmployerChoiceDto): Promise<{ chosen: true }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.reader.chooseIdentity({ workspaceId, businessUnitScope: null }, user.userId, dto.employerName, {
      siren: dto.siren,
      name: dto.legalName ?? null,
    })
    return { chosen: true }
  }
}
