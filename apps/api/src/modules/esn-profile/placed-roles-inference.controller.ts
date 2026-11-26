import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import type { PlacedRolesInferenceResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DismissInferredPlacedRoleDto } from './dto/dismiss-inferred-placed-role.dto'
import { PlacedRolesInferenceService } from './placed-roles-inference.service'

/**
 * Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026).
 * « Confirmer » et « Ajouter » passent par la sauvegarde du profil
 * (`placed_roles`, le déclaré) ; « Retirer » est ici.
 */
@Controller('esn-profile/placed-roles-inference')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PlacedRolesInferenceController {
  constructor(private readonly inference: PlacedRolesInferenceService) {}

  // Lecture du profil de sa propre société : ouverte à tous les rôles, comme `GET /esn-profile`.
  @Get()
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<PlacedRolesInferenceResponse> {
    return this.inference.getForUser(user.userId)
  }

  /** Retire un métier déduit — un fait d'entreprise : réservé à qui gère l'entreprise. */
  @Post('dismiss')
  @HttpCode(200)
  @RequirePermission('team:manage')
  async dismiss(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: DismissInferredPlacedRoleDto,
  ): Promise<PlacedRolesInferenceResponse> {
    return this.inference.dismiss(user.userId, body.role)
  }
}
