import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import {
  AddTargetListItemDto,
  CreateTargetListDto,
  RemoveTargetListItemDto,
  UpdateTargetListDto,
  UpdateTargetListItemDto,
} from './dto/target-lists.dto'
import { TargetListsService } from './target-lists.service'

/**
 * #2155.13 à .21 — « Mes cibles ». Ouvert à tout membre : une liste de travail
 * n'est pas un palier, c'est la façon dont l'espace organise ce qu'il a déjà.
 *
 * « Ouvert à tout membre » veut dire non gardé par un palier de PLAN — pas
 * non gardé du tout. Les deux lectures sont de la donnée d'espace en lecture
 * seule (`@WorkspaceRead`, même raisonnement que `accounts.controller.ts`,
 * D39) ; les six écritures portent `records:write`, comme toute création,
 * correction ou suppression de fiche ailleurs dans l'API — un `viewer`, qui ne
 * détient aucune permission, ne doit pas pouvoir créer ou supprimer une liste.
 */
@Controller('target-lists')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class TargetListsController {
  constructor(private readonly targetLists: TargetListsService) {}

  @Get()
  @WorkspaceRead()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.targetLists.list(user.userId)
  }

  /** Les fiches de l'espace proposées à l'ajout — jamais le marché. */
  @Get('candidates')
  @WorkspaceRead()
  candidates(@CurrentUser() user: CurrentUserPayload, @Query('q') q?: string) {
    return this.targetLists.candidates(user.userId, q)
  }

  @Post()
  @RequirePermission('records:write')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateTargetListDto) {
    return this.targetLists.createList(user.userId, body)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTargetListDto,
  ) {
    return this.targetLists.updateList(user.userId, id, body)
  }

  @Delete(':id')
  @RequirePermission('records:write')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.targetLists.deleteList(user.userId, id)
  }

  @Post(':id/items')
  @RequirePermission('records:write')
  addItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddTargetListItemDto,
  ) {
    return this.targetLists.addItem(user.userId, id, body)
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('records:write')
  updateItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateTargetListItemDto,
  ) {
    return this.targetLists.updateItem(user.userId, id, itemId, body)
  }

  /** #2156.31 — un retrait porte son motif. Il ne touche jamais la fiche. */
  @Delete(':id/items/:itemId')
  @RequirePermission('records:write')
  removeItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: RemoveTargetListItemDto,
  ) {
    return this.targetLists.removeItem(user.userId, id, itemId, body)
  }
}
