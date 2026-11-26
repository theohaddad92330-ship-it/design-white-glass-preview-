import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { ContactAssignmentResult, DistributeApplyResponse, DistributePreviewResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountAssignmentService, type AccountAssignmentResult } from './account-assignment.service'
import { ContactAssignmentService } from './contact-assignment.service'
import { AssignAccountDto } from './dto/assign-account.dto'
import { AssignContactsDto } from './dto/assign-contacts.dto'
import { DistributeApplyDto } from './dto/distribute-apply.dto'

/**
 * `PATCH /accounts/:id/assign` — set (or clear) the account's responsable.
 *
 * Registered under the `accounts` prefix but in its own module, exactly like
 * `CoverageController` (craft rule 7): removing this module removes the feature
 * and touches nothing else. Authorisation lives entirely in the service, which
 * reads the RBAC matrix rather than role strings.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AssignmentController {
  constructor(private readonly assignment: AccountAssignmentService) {}

  // Attribuer un compte MODIFIE une fiche : c'est `records:write`, et ça ne
  // l'était nulle part — le service lisait bien la matrice RBAC, mais la route
  // ne DÉCLARAIT rien, donc GA-05 la comptait parmi les 377 muettes.
  @RequirePermission('records:write')
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignAccountDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountAssignmentResult> {
    return this.assignment.assign(user.userId, id, dto.assigned_to)
  }
}

/**
 * `PATCH /contacts/assign` — attribue (ou libère) une SÉLECTION de contacts.
 *
 * Chemin littéral à un seul segment : il ne peut pas entrer en collision avec
 * les routes `PATCH /contacts/:id/...` de `ContactsController` (deux segments),
 * quel que soit l'ordre d'enregistrement des modules.
 *
 * Même découpage que ci-dessus (craft rule 7) : le contrôleur ne fait que
 * transporter, toute l'autorisation vit dans le service, qui lit la matrice RBAC
 * et scope la lecture au workspace.
 */
@Controller('contacts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactAssignmentController {
  constructor(private readonly assignment: ContactAssignmentService) {}

  @RequirePermission('records:write')
  @Patch('assign')
  assignMany(
    @Body() dto: AssignContactsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ContactAssignmentResult> {
    return this.assignment.assignMany(user.userId, dto.contact_ids, dto.assigned_to)
  }

  /** #4996 L5 — l'ordre du sélecteur de porteur : qui couvre l'entité du contact d'abord. Lecture seule. */
  // Le sélecteur ne sert qu'à attribuer : même permission que `PATCH contacts/assign` (GA-05).
  @RequirePermission('records:write')
  @Get(':id/assignee-candidates')
  assigneeCandidates(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.assignment.assigneeCandidates(user.userId, id)
  }
}

/**
 * #4996 L5 — « Répartir selon les périmètres » : `POST accounts/:id/team/distribute/preview` puis `…/apply`.
 * Rien ne part seul (Q2) : l'aperçu est figé par empreinte, le clic de l'utilisateur déclenche l'apply. Le droit
 * (`canEditAccountTeam`) est jugé par le service.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactDistributionController {
  constructor(private readonly assignment: ContactAssignmentService) {}

  @RequirePermission('records:write')
  @Post(':id/team/distribute/preview')
  preview(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<DistributePreviewResponse> {
    return this.assignment.distributePreview(user.userId, id)
  }

  @RequirePermission('records:write')
  @Post(':id/team/distribute/apply')
  apply(
    @Param('id') id: string,
    @Body() dto: DistributeApplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DistributeApplyResponse> {
    return this.assignment.distributeApply(user.userId, id, dto.fingerprint)
  }
}
