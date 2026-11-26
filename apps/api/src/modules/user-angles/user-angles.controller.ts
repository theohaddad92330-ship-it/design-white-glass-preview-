import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateUserAngleDto, UpdateUserAngleDto } from './user-angles.dto'
import { UserAnglesService, type UserAngleView } from './user-angles.service'

/**
 * #4739 — « Mes angles ». `@PersonalScope` : chaque route ne sert que les angles de CELUI qui appelle
 * (un autre membre de l'espace ne voit rien grâce à elle ; le partage est une question ouverte).
 * « Retirer » (DELETE) archive, ne supprime pas.
 */
@Controller('user-angles')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@PersonalScope()
export class UserAnglesController {
  constructor(
    private readonly angles: UserAnglesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload): Promise<UserAngleView[]> {
    return this.angles.list(user.userId)
  }

  @Post()
  async create(@Body() dto: CreateUserAngleDto, @CurrentUser() user: CurrentUserPayload): Promise<UserAngleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.angles.create({ userId: user.userId, workspaceId }, dto)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserAngleDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<UserAngleView> {
    return this.angles.update(user.userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.angles.archive(user.userId, id)
  }
}
