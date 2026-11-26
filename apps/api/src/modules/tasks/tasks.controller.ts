import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { Task } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/task.dto'
import { TasksService } from './tasks.service'

/** Les tâches — les miennes, celles d'un compte, d'un contact ou d'un projet. */
@Controller('tasks')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListTasksQueryDto): Promise<{ items: Task[] }> {
    return this.tasks.list(user.userId, query)
  }

  @Post()
  @RequirePermission('records:write')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateTaskDto): Promise<Task> {
    return this.tasks.create(user.userId, body)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasks.update(user.userId, id, body)
  }

  @Delete(':id')
  @RequirePermission('records:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tasks.remove(user.userId, id)
  }
}
