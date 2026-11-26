import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  can,
  closeAssignmentSchema,
  createFactoringContractSchema,
  markAssignedSchema,
  prepareAssignmentSchema,
  reconcileSettlementSchema,
  recordSettlementSchema,
  updateFactoringContractSchema,
  type FactoringView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { FactoringService } from './factoring.service'

class CreateContractDto extends createZodDto(createFactoringContractSchema) {}
class UpdateContractDto extends createZodDto(updateFactoringContractSchema) {}
class PrepareAssignmentDto extends createZodDto(prepareAssignmentSchema) {}
class MarkAssignedDto extends createZodDto(markAssignedSchema) {}
class CloseAssignmentDto extends createZodDto(closeAssignmentSchema) {}
class RecordSettlementDto extends createZodDto(recordSettlementSchema) {}
class ReconcileSettlementDto extends createZodDto(reconcileSettlementSchema) {}

/**
 * LA CESSION DE CRÉANCE — la porte HTTP (31/08/2026, révisé le 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LECTURE — UNE VUE « NOMBRES SEULEMENT » SANS `finance:read`
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Revirement daté.** Ce fichier fermait `GET /factoring` derrière
 * `finance:read` SEC (403 sans le droit), avec l'argument qu'une cession EST
 * un montant et qu'une ligne sans chiffre ne dit plus rien. C'était vrai de la
 * LIGNE et faux de l'ÉCRAN : les compteurs de l'entête, le nombre de cessions,
 * leur mission, leur statut et l'état de réconciliation (« compte juste »,
 * « en attente »…) sont des faits d'ESPACE, pas des chiffres de paie —
 * exactement ce que `CollectionsPage` offre déjà sur les encaissements, et que
 * cet écran refusait à qui n'a pas `finance:read`, y compris pour aller
 * chercher CE QUI BLOQUE.
 *
 * `@WorkspaceRead` et non `@RequirePermission` : `ROLE_PERMISSIONS` ne porte
 * aucune permission de LECTURE, et fermer la route revenait à priver `viewer`
 * et `tech_admin` d'un écran qu'ils peuvent déjà lire partout ailleurs. C'est
 * le CHAMP financier qui se garde désormais (`redactFinance`, D45) —
 * `assignedAmountCents`, `commissionAmountCents`, et le
 * `settledCents`/`varianceCents` de chaque réconciliation sortent RETIRÉS,
 * jamais à `0`. Voir `FactoringService.view` pour ce qui reste lisible et
 * pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRITURE — TOUJOURS DERRIÈRE `finance:write`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le revirement ne touche QUE la lecture. Préparer, transmettre, régler ou
 * rapprocher une cession engage l'argent de l'ESN — c'est la même frontière
 * que `OutgoingPaymentsController` tient déjà entre sa liste ouverte et ses
 * écritures gardées. `finance:write` pour écrire, les deux droits que l'espace
 * accorde déjà pour marquer un mois facturé et enregistrer un paiement.
 *
 * ⚠️ C'est le CONTRÔLEUR qui résout l'espace ET le droit financier, pas le
 * service. Ce n'est pas une préférence : `module-boundaries.spec.ts` (GA-07)
 * est exactement au plafond de son cliquet, et un service qui importerait
 * `WorkspaceContextService` le ferait rougir. Le contrôleur est hors du
 * corpus de cette garde.
 */
@Controller('factoring')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class FactoringController {
  constructor(
    private readonly factoring: FactoringService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * L'espace ET le droit financier, résolus ENSEMBLE — même patron que
   * `OutgoingPaymentsController.financeContext`. `extraPermissionsOf` et non
   * `can(role, [], …)` : les permissions accordées membre par membre sont
   * ADDITIVES, et les ignorer rendrait sans effet un droit qu'un responsable a
   * explicitement donné.
   */
  private async financeContext(userId: string): Promise<{ workspaceId: string; canReadFinance: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return { workspaceId, canReadFinance: can(role, extra, 'finance:read') }
  }

  /** Tout l'écran en une lecture — voir le docblock de `FactoringService.view`. */
  @Get()
  @WorkspaceRead()
  async view(@CurrentUser() user: CurrentUserPayload): Promise<FactoringView> {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    return this.factoring.view(workspaceId, { canReadFinance })
  }

  @Post('contracts')
  @RequirePermission('finance:write')
  async createContract(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateContractDto) {
    return this.factoring.createContract(await this.scope(user.userId), body)
  }

  @Patch('contracts/:id')
  @RequirePermission('finance:write')
  async updateContract(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContractDto,
  ) {
    return this.factoring.updateContract(await this.scope(user.userId), id, body)
  }

  /** « Préparer la cession ». Il ne transmet rien : un humain le fera. */
  @Post('assignments')
  @RequirePermission('finance:write')
  async prepare(@CurrentUser() user: CurrentUserPayload, @Body() body: PrepareAssignmentDto) {
    return this.factoring.prepare(await this.scope(user.userId), body)
  }

  /** Consigner que la créance a été TRANSMISE au factor. */
  @Post('assignments/:id/assigned')
  @RequirePermission('finance:write')
  async markAssigned(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkAssignedDto,
  ) {
    return this.factoring.markAssigned(await this.scope(user.userId), id, body)
  }

  /** Marquer la cession RÉGLÉE — un geste humain, jamais une déduction. */
  @Post('assignments/:id/settled')
  @RequirePermission('finance:write')
  async markSettled(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.factoring.markSettled(await this.scope(user.userId), id)
  }

  /** Consigner un REFUS ou une REPRISE du factor. Le motif est obligatoire. */
  @Post('assignments/:id/close')
  @RequirePermission('finance:write')
  async close(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseAssignmentDto,
  ) {
    return this.factoring.close(await this.scope(user.userId), id, body)
  }

  /** Enregistrer un règlement REÇU du factor. `assignmentId` est facultatif :
   *  un avis global se saisit d'abord et se rapproche ensuite. */
  @Post('settlements')
  @RequirePermission('finance:write')
  async recordSettlement(@CurrentUser() user: CurrentUserPayload, @Body() body: RecordSettlementDto) {
    return this.factoring.recordSettlement(await this.scope(user.userId), user.userId, body)
  }

  /** RAPPROCHER un règlement d'une cession. */
  @Post('settlements/:id/reconcile')
  @RequirePermission('finance:write')
  async reconcileSettlement(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReconcileSettlementDto,
  ) {
    return this.factoring.reconcileSettlement(await this.scope(user.userId), id, body.assignmentId)
  }
}
