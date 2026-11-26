import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { Task } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { RequestAccountValidationDto } from './dto/request-account-validation.dto'
import { TasksService } from './tasks.service'

/**
 * #2128.13 (épopée #2788) — « Permettre de demander validation manager »
 * (ACC-V4-027, collaboration). Voir `TasksService.requestManagerValidation` :
 * pose une tâche sur chaque membre habilité (`team:manage`), jamais un
 * mécanisme de notification séparé.
 */
@Controller('accounts/:accountId/request-validation')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountValidationRequestController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @RequirePermission('records:write')
  requestValidation(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: RequestAccountValidationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: Task[] }> {
    return this.tasks.requestManagerValidation(user.userId, accountId, body.note).then(items => ({ items }))
  }
}
