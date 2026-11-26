import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import { entityResolutionCorrectionRequestSchema, type EntityResolutionCorrection } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { AccountsService } from './accounts.service'
import { EntityResolutionCorrectionsService } from './entity-resolution-corrections.service'

/**
 * #2284.65 / .67-.69 — « C'EST BIEN CELLE-CI » / « CE N'EST PAS CELLE-CI ».
 *
 * La réponse de l'humain à la carte « Entité résolue » (question d'ambiguïté ou
 * entité résolue). `POST` et non `PUT` : chaque geste est une VERSION de plus,
 * jamais le remplacement de la précédente (on archive, on ne supprime pas).
 *
 * `records:write` pour l'écriture : c'est une correction de la donnée de
 * l'espace, même famille que « c'est bien cette entreprise » de la mémoire
 * marché (`PUT accounts/:id/market-resolution`, #1617.4).
 *
 * Contrôleur SÉPARÉ d'`AccountsController` (même préfixe, routes disjointes) :
 * une vingtaine de specs construisent celui-là positionnellement.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class EntityResolutionCorrectionsController {
  constructor(
    private readonly corrections: EntityResolutionCorrectionsService,
    private readonly accountsService: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    /** ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent,
     *  `resolveBusinessUnitScope` LÈVE au lieu de servir tout l'espace. */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  /** La porte d'espace ET de périmètre, AVANT toute lecture ou écriture : un
   *  compte hors de portée rend 404 et rien n'est écrit. */
  private async visibleWorkspace(accountId: string, userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    unwrap(
      await this.accountsService.findOneForWorkspace(
        accountId,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
      ),
      failure => {
        throw new NotFoundException(failure.message)
      },
    )
    return workspaceId
  }

  @Get(':id/entity-resolution/corrections')
  @WorkspaceRead()
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<EntityResolutionCorrection[]> {
    const workspaceId = await this.visibleWorkspace(id, user.userId)
    return this.corrections.list(workspaceId, id)
  }

  @Post(':id/entity-resolution/corrections')
  @RequirePermission('records:write')
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<EntityResolutionCorrection> {
    // `safeParse` et non `parse` : un `ZodError` nu sortirait en 500 opaque.
    const parsed = entityResolutionCorrectionRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException(
        'Correction illisible : elle dit « c’est bien celle-ci » ou « ce n’est pas celle-ci », et nomme l’entreprise visée.',
      )
    }
    const workspaceId = await this.visibleWorkspace(id, user.userId)
    // L'espace et l'auteur viennent du JETON : le schéma a jeté ceux du corps.
    return this.corrections.record({ workspaceId, accountId: id, decidedBy: user.userId, request: parsed.data })
  }
}
