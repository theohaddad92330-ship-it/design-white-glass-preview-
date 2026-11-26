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
  Put,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  assignmentInputSchema,
  createMissionExpenseSchema,
  createSupplierInvoiceSchema,
  missionMarginScenarioSchema,
  setMissionCraContactSchema,
  setMissionClientManagerSchema,
  setSupplierInvoiceStatusSchema,
  updateMissionExpenseSchema,
  updateSupplierInvoiceSchema,
  upsertCommercialTermsSchema,
  type MissionAssignment,
  type MissionCommercialTerms,
  type MissionExpense,
  type MissionMarginScenarioResult,
  type StaffingState,
  type SupplierInvoice,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MissionExpensesService } from './mission-expenses.service'
import { StaffingService, type MissionContactsPanel } from './staffing.service'
import { SupplierInvoicesService } from './supplier-invoices.service'

class AssignmentDto extends createZodDto(assignmentInputSchema) {}
class CommercialTermsDto extends createZodDto(upsertCommercialTermsSchema) {}
class MarginScenarioDto extends createZodDto(missionMarginScenarioSchema) {}
class CreateExpenseDto extends createZodDto(createMissionExpenseSchema) {}
class UpdateExpenseDto extends createZodDto(updateMissionExpenseSchema) {}
class CreateSupplierInvoiceDto extends createZodDto(createSupplierInvoiceSchema) {}
class UpdateSupplierInvoiceDto extends createZodDto(updateSupplierInvoiceSchema) {}
class SetSupplierInvoiceStatusDto extends createZodDto(setSupplierInvoiceStatusSchema) {}
class SetCraContactDto extends createZodDto(setMissionCraContactSchema) {}
class SetClientManagerDto extends createZodDto(setMissionClientManagerSchema) {}

/**
 * Le staffing d'une mission, et ses conditions commerciales.
 *
 * Les conditions ne sont pas derrière un `@RequirePermission('finance:read')` :
 * la LECTURE de la mission reste ouverte à l'équipe, et c'est le CHAMP qui
 * disparaît. Refuser toute la route renverrait un 403 sur une mission que la
 * personne a le droit de voir, et l'écran se lirait « panne » au lieu de
 * « pas ton périmètre ».
 */
@Controller('delivery/missions/:id')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class StaffingController {
  constructor(
    private readonly staffing: StaffingService,
    private readonly expenses: MissionExpensesService,
    private readonly supplierInvoices: SupplierInvoicesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Un seul endroit résout l'espace actif — même règle que `TimesheetsController`. */
  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get('assignments')
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: MissionAssignment[] }> {
    return { items: await this.staffing.listForMission(user.userId, id) }
  }

  @Put('assignments')
  @RequirePermission('records:write')
  assign(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignmentDto,
  ): Promise<MissionAssignment> {
    return this.staffing.assign(user.userId, id, body)
  }

  @Delete('assignments/:assignmentId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async unassign(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<void> {
    await this.staffing.unassign(user.userId, id, assignmentId)
  }

  @Get('terms')
  async terms(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const canReadFinance = await this.staffing.canReadFinance(user.userId)
    const { terms, margin, expensesTotalCents, supplierInvoicesTotalCents, marginWithExpenses, marginEngine } =
      await this.staffing.readTerms(user.userId, id, canReadFinance)
    // `canReadFinance` voyage avec la réponse : sans lui, l'écran ne saurait pas
    // distinguer « pas le droit » de « pas renseigné », et afficherait le même
    // vide dans les deux cas. `marginEngine` (#2420) : le calcul complet du
    // moteur de marge — ses sources, sa période, ses exclusions et son état.
    return {
      canReadFinance,
      terms,
      margin,
      expensesTotalCents,
      supplierInvoicesTotalCents,
      marginWithExpenses,
      marginEngine,
    }
  }

  /**
   * #2420.14 — un SCÉNARIO de marge. `POST` parce qu'il porte un corps, pas
   * parce qu'il écrit : il ne touche à rien, et le service le prouve en test.
   * Réservé à `finance:read` — un scénario rend des coûts, comme la fiche.
   */
  @Post('terms/scenario')
  @HttpCode(200)
  @RequirePermission('finance:read')
  marginScenario(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarginScenarioDto,
  ): Promise<MissionMarginScenarioResult> {
    return this.staffing.simulateMargin(user.userId, id, body)
  }

  @Put('terms')
  @RequirePermission('finance:read')
  setTerms(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommercialTermsDto,
  ): Promise<MissionCommercialTerms> {
    return this.staffing.upsertTerms(user.userId, id, body)
  }

  /**
   * Le PANNEAU LATÉRAL de planification — entité cliente et trois contacts
   * (PDF-22 §7). Aucune permission dédiée : ce sont des personnes à contacter,
   * pas des montants — la même politique d'accès que `assignments`.
   */
  @Get('panel')
  async panel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MissionContactsPanel> {
    return this.staffing.readContacts(user.userId, id)
  }

  /**
   * « Changer le contact CRA ». `records:write`, comme l'affectation d'un
   * consultant : c'est le même GESTE — poser qui est rattaché à la mission.
   */
  @Patch('cra-contact')
  @RequirePermission('records:write')
  async setCraContact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetCraContactDto,
  ): Promise<{ contactId: string | null }> {
    await this.staffing.setCraContact(user.userId, id, body.contactId)
    return { contactId: body.contactId }
  }

  /**
   * #2836 — « Désigner le manager client ». `records:write`, même geste que le
   * contact CRA : poser qui est rattaché à la mission.
   */
  @Patch('client-manager')
  @RequirePermission('records:write')
  async setClientManager(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetClientManagerDto,
  ): Promise<{ contactId: string | null }> {
    await this.staffing.setClientManager(user.userId, id, body.contactId)
    return { contactId: body.contactId }
  }

  /**
   * Les lignes de frais d'une mission (30/08/2026).
   *
   * Réservées à `finance:read`, comme les conditions commerciales dont elles
   * complètent la marge — un montant de frais est un COÛT au même titre que le
   * coût chargé, et la même porte les garde toutes les deux.
   */
  @Get('expenses')
  @RequirePermission('finance:read')
  async listExpenses(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: MissionExpense[] }> {
    return { items: await this.expenses.list(await this.scope(user.userId), id) }
  }

  @Post('expenses')
  @RequirePermission('finance:read')
  async createExpense(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateExpenseDto,
  ): Promise<MissionExpense> {
    return this.expenses.create(await this.scope(user.userId), user.userId, id, body)
  }

  /**
   * Édite une ligne. Toujours `source: 'human'` — c'est le geste d'une
   * personne depuis la fiche mission ; `MissionExpensesService.update` refuse
   * en interne une écriture de moindre autorité contre un montant SAISI à la
   * main, mais cette route-ci n'écrit jamais qu'avec l'autorité la plus haute.
   */
  @Patch('expenses/:expenseId')
  @RequirePermission('finance:read')
  async updateExpense(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() body: UpdateExpenseDto,
  ): Promise<MissionExpense> {
    return this.expenses.update(await this.scope(user.userId), id, expenseId, body)
  }

  /**
   * Les factures ENTRANTES d'un sous-traitant (30/08/2026) — distinctes de la
   * facturation CLIENT. Réservées à `finance:read`, comme les frais.
   */
  @Get('supplier-invoices')
  @RequirePermission('finance:read')
  async listSupplierInvoices(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: SupplierInvoice[] }> {
    return { items: await this.supplierInvoices.list(await this.scope(user.userId), id) }
  }

  @Post('supplier-invoices')
  @RequirePermission('finance:read')
  async createSupplierInvoice(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSupplierInvoiceDto,
  ): Promise<SupplierInvoice> {
    return this.supplierInvoices.create(await this.scope(user.userId), user.userId, id, body)
  }

  @Patch('supplier-invoices/:invoiceId')
  @RequirePermission('finance:read')
  async updateSupplierInvoice(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: UpdateSupplierInvoiceDto,
  ): Promise<SupplierInvoice> {
    return this.supplierInvoices.update(await this.scope(user.userId), id, invoiceId, body)
  }

  /**
   * Fait avancer le cycle de vie — « devons-nous payer », pas « sommes-nous
   * prêts à émettre ». `finance:write`, comme les gestes équivalents de
   * `InvoiceReadinessController` (marquer facturé, marquer payé) : c'est le
   * même arbitrage — LIRE une marge informe, faire sortir un montant d'un
   * suivi est un geste qui pèse plus lourd.
   */
  @Post('supplier-invoices/:invoiceId/status')
  @RequirePermission('finance:write')
  async setSupplierInvoiceStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: SetSupplierInvoiceStatusDto,
  ): Promise<SupplierInvoice> {
    return this.supplierInvoices.setStatus(await this.scope(user.userId), id, invoiceId, body.status)
  }
}

/** La disponibilité DÉDUITE d'un talent — lue depuis le vivier. */
@Controller('talents/:id/staffing')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class TalentStaffingController {
  constructor(private readonly staffing: StaffingService) {}

  @Get()
  async state(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ staffing: StaffingState; assignments: MissionAssignment[] }> {
    const [staffing, assignments] = await Promise.all([
      this.staffing.staffingFor(user.userId, id),
      this.staffing.listForConsultant(user.userId, id),
    ])
    return { staffing, assignments }
  }
}
