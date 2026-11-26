import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  addCatalogueValueSchema,
  catalogueKeySchema,
  type CataloguesResponse,
  type CatalogueValue,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CataloguesService } from './catalogues.service'

class AddCatalogueValueDto extends createZodDto(addCatalogueValueSchema) {}

/**
 * Les catalogues d'un espace (BEL-CRM-105).
 *
 * La LECTURE est ouverte : savoir quel vocabulaire l'équipe utilise n'est pas
 * une information sensible, et le cacher pousse chacun à réinventer le sien.
 * L'ÉCRITURE demande `team:manage` — changer le vocabulaire d'un espace change
 * ce que TOUT LE MONDE voit dans ses sélecteurs.
 */
@Controller('settings/catalogues')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CataloguesController {
  constructor(
    private readonly catalogues: CataloguesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query('lang') lang?: string): Promise<CataloguesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.catalogues.list(workspaceId, lang === 'en' ? 'en' : 'fr')
  }

  @Post()
  @RequirePermission('team:manage')
  async add(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddCatalogueValueDto): Promise<CatalogueValue> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.catalogues.add(workspaceId, dto.key, dto.label)
  }

  /** Retire une valeur. La réponse DIT si elle a été supprimée ou seulement
   *  désactivée : quelqu'un qui clique « supprimer » et voit la valeur rester
   *  doit comprendre pourquoi, sinon il reclique. */
  @Delete(':key/:id')
  @RequirePermission('team:manage')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('key') key: string,
    @Param('id') id: string,
  ): Promise<{ outcome: 'delete' | 'archive' }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.catalogues.remove(workspaceId, catalogueKeySchema.parse(key), id)
  }
}
