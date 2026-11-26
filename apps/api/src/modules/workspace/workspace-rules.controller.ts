import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { updateWorkspaceRulesSchema, type WorkspaceRulesView } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from './require-permission.decorator'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceRulesService } from './workspace-rules.service'

class UpdateWorkspaceRulesDto extends createZodDto(updateWorkspaceRulesSchema) {}

/**
 * #2081.14 — LES RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026), posées par
 * l'administrateur, qui priment sur les réglages individuels.
 *
 * Un contrôleur à part pour que le retirer retire les règles et rien d'autre
 * (règle n°7) — les DÉCISIONS qu'elles portent, elles, vivent au guard et dans
 * `BusinessUnitService.scopeFor`, et reviennent à leur défaut sans ligne.
 *
 * · LIRE : tout membre (`@WorkspaceRead`). Qui se voit refuser un export doit
 *   pouvoir lire la règle qui le lui refuse, et qui l'a posée.
 * · CHANGER : `team:manage` au guard, PUIS propriétaire ou administrateur dans
 *   le service — un responsable d'agence porte `team:manage` et ne pose pas
 *   les règles de tout l'espace. Les deux refus rendent 403.
 */
@Controller('workspaces/rules')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceRulesController {
  constructor(private readonly rules: WorkspaceRulesService) {}

  @Get()
  @WorkspaceRead()
  view(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceRulesView> {
    return this.rules.view(user.userId)
  }

  @Patch()
  @RequirePermission('team:manage')
  update(@CurrentUser() user: CurrentUserPayload, @Body() body: UpdateWorkspaceRulesDto): Promise<WorkspaceRulesView> {
    return this.rules.update(user.userId, body)
  }
}
