import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { createLegalEntitySchema, updateLegalEntitySchema, type LegalEntity } from '@bellum/contracts'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { LegalEntitiesService } from './legal-entities.service'

class CreateLegalEntityDto extends createZodDto(createLegalEntitySchema) {}
class UpdateLegalEntityDto extends createZodDto(updateLegalEntitySchema) {}
class ArchiveLegalEntityDto extends createZodDto(z.object({ archived: z.boolean() })) {}

/**
 * Les sociétés de l'ESN (décision D9).
 *
 * Gardé par `billing:manage` en écriture : déclarer la société qui facture est
 * une décision de facturation, pas de commerce. La LECTURE reste ouverte à tous
 * les membres — un commercial doit pouvoir voir quelle société porte la mission
 * dont il parle au client, sans avoir accès à l'abonnement.
 */
@Controller('legal-entities')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class LegalEntitiesController {
  constructor(
    private readonly entities: LegalEntitiesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** L'espace actif de l'appelant. Résolu ICI : le contrôleur est la couche qui
   *  connaît l'utilisateur, et la règle §3.2 veut qu'un service n'aille pas
   *  chercher le service d'un autre module. */
  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<{ items: LegalEntity[] }> {
    return this.entities.list(await this.workspaceOf(user.userId))
  }

  @Post()
  @RequirePermission('billing:manage')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateLegalEntityDto): Promise<LegalEntity> {
    return this.entities.create(await this.workspaceOf(user.userId), dto)
  }

  @Patch(':id')
  @RequirePermission('billing:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLegalEntityDto,
  ): Promise<LegalEntity> {
    return this.entities.update(await this.workspaceOf(user.userId), id, dto)
  }

  /** Archiver ou réactiver. Il n'y a PAS de suppression : une société a porté
   *  des missions et des mois facturés, et l'effacer rendrait illisible
   *  l'historique qui la nomme. */
  @Patch(':id/archive')
  @RequirePermission('billing:manage')
  async archive(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveLegalEntityDto,
  ): Promise<LegalEntity> {
    return this.entities.archive(await this.workspaceOf(user.userId), id, dto.archived)
  }
}
