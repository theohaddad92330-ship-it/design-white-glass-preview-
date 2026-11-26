import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  CreateBusinessUnitDto,
  RequestBusinessUnitAccessDto,
  SetMemberBusinessUnitAccessDto,
  UpdateBusinessUnitDto,
} from './dto/business-unit.dto'
import { BusinessUnitService } from './business-unit.service'

/**
 * Les périmètres de travail d'un espace — BU, agence, équipe, territoire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUI PEUT QUOI, ET POURQUOI CETTE RÉPARTITION
 * ─────────────────────────────────────────────────────────────────────────────
 * · LIRE la liste : tout membre (`@WorkspaceRead`). Ce qui est cloisonné, ce
 *   sont les DONNÉES d'un périmètre, pas son existence — sinon « Demander
 *   l'accès » (#2087.16) n'aurait aucun sens : on ne demande pas l'accès à ce
 *   qu'on ne peut pas nommer.
 * · CRÉER / MODIFIER un périmètre, RÉGLER le niveau d'accès de quelqu'un,
 *   RÉPONDRE à une demande : `team:manage`. Ce sont les gestes d'ORGANISATION,
 *   et ils vivent déjà sous cette permission (inviter, retirer, attribuer un
 *   portefeuille). Un `viewer` n'en détient aucune : il ne peut rien de tout ça.
 * · REJOINDRE / DEMANDER : tout membre, pour SOI. Le `userId` vient du jeton,
 *   jamais du corps — sans quoi n'importe qui inscrirait n'importe qui.
 *
 * ⚠️ Aucune route de ce contrôleur ne reçoit un `workspaceId` du client. Il est
 * TOUJOURS résolu depuis le jeton (`resolveActiveWorkspace`) : c'est la seule
 * forme qui rende le cloisonnement d'espace non contournable, et
 * `business-unit-scope.spec.ts` vérifie qu'aucune route ne s'en écarte.
 */
@Controller('business-units')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class BusinessUnitController {
  constructor(
    private readonly businessUnits: BusinessUnitService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Les périmètres de l'espace, en cartes (#2087.14). */
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.businessUnits.list(workspaceId, user.userId)
  }

  /** « Créer un autre périmètre » (#2087.17). */
  @Post()
  @RequirePermission('team:manage')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateBusinessUnitDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.businessUnits.create(workspaceId, user.userId, body)
  }

  @Patch(':id')
  @RequirePermission('team:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBusinessUnitDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.businessUnits.update(workspaceId, id, body)
  }

  /**
   * « Rejoindre » (#2087.15) — pour SOI, et le jeton dit qui.
   *
   * ⚠️ Un membre CLOISONNÉ est refusé ici et renvoyé vers « demander l'accès »
   * (revue sécurité 15/09/2026) : sans ce refus, le circuit demande / accord /
   * refus se contournait par un POST sur cette route. Le contrôle vit dans le
   * service, avec la lecture du niveau d'accès qui le fonde.
   */
  @Post(':id/join')
  @RequirePermission('records:write')
  async join(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.businessUnits.join(workspaceId, id, user.userId)
    return { joined: true }
  }

  /** « Demander l'accès » (#2087.16). */
  @Post(':id/access-request')
  @RequirePermission('records:write')
  async requestAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestBusinessUnitAccessDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.businessUnits.requestAccess(workspaceId, id, user.userId, body.message ?? null)
    return { requested: true }
  }

  @Post('access-requests/:requestId/grant')
  @RequirePermission('team:manage')
  async grant(@CurrentUser() user: CurrentUserPayload, @Param('requestId', ParseUUIDPipe) requestId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.businessUnits.decideAccessRequest(workspaceId, requestId, user.userId, true)
    return { granted: true }
  }

  @Post('access-requests/:requestId/refuse')
  @RequirePermission('team:manage')
  async refuse(@CurrentUser() user: CurrentUserPayload, @Param('requestId', ParseUUIDPipe) requestId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.businessUnits.decideAccessRequest(workspaceId, requestId, user.userId, false)
    return { refused: true }
  }

  /**
   * Le niveau d'accès d'un membre, et ses périmètres (#2005.7, #2081.19).
   *
   * ⚠️ C'est LA route sensible du module : elle décide de ce qu'une personne
   * voit. Sous `team:manage` ; elle refuse un membre d'un autre espace
   * (`workspace_member_not_found`) et un périmètre d'un autre espace
   * (`business_unit_not_in_workspace`) — les deux refus ont leur test nommé.
   *
   * ⚠️ L'identité de l'APPELANT descend jusqu'au service — revue sécurité
   * 15/09/2026. Elle ne descendait pas, et le service ne pouvait donc refuser
   * ni l'auto-attribution ni le ciblage du propriétaire.
   */
  @Put('members/:userId/access')
  @RequirePermission('team:manage')
  async setMemberAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() body: SetMemberBusinessUnitAccessDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.businessUnits.setMemberAccess(workspaceId, user.userId, targetUserId, body)
    return { updated: true }
  }
}
