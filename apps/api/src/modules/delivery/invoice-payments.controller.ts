import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { InvoicePaymentsService, type InvoicePayment, type PaymentsView } from './invoice-payments.service'

const recordUnmatchedPaymentSchema = z
  .object({
    // Un paiement a un montant : `0` voudrait dire « non mesuré », qui n'est pas un paiement.
    amountCents: z.number().int().positive(),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ'),
    payer: z.string().trim().min(1).max(200).optional(),
    reference: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
class RecordUnmatchedPaymentDto extends createZodDto(recordUnmatchedPaymentSchema) {}

const matchPaymentSchema = z.object({ invoiceReadinessId: z.string().guid() }).strict()
class MatchPaymentDto extends createZodDto(matchPaymentSchema) {}

const customerCreditSchema = z.object({ note: z.string().trim().min(1).max(500) }).strict()
class CustomerCreditDto extends createZodDto(customerCreditSchema) {}

/**
 * #2419.1 / .3 / .5 / .11 — les PAIEMENTS, distincts des factures.
 *
 * Tout est déclaratif : un paiement a été CONSTATÉ par quelqu'un (D33, aucun
 * compte bancaire rapproché), un rapprochement est un geste HUMAIN, un double
 * paiement est SIGNALÉ, un crédit client est une NOTE. Aucune route n'émet,
 * ne rembourse ni ne comptabilise.
 *
 * `finance:read` pour lire (des montants de tout l'espace), `finance:write`
 * pour écrire — même arbitrage que « marquer payé ».
 */
@Controller('delivery/payments')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class InvoicePaymentsController {
  constructor(
    private readonly payments: InvoicePaymentsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Les paiements À RAPPROCHER (avec leurs candidates) et les factures PAYÉES EN TROP. */
  @Get()
  @RequirePermission('finance:read')
  async list(@CurrentUser() user: CurrentUserPayload): Promise<PaymentsView> {
    return this.payments.list(await this.scope(user.userId))
  }

  /** #2419.1 — un paiement reçu sans facture connue : il reste à rapprocher. */
  @Post()
  @RequirePermission('finance:write')
  async recordUnmatched(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: RecordUnmatchedPaymentDto,
  ): Promise<InvoicePayment> {
    return this.payments.recordUnmatched(await this.scope(user.userId), user.userId, body)
  }

  /** #2419.3 — le geste humain qui rattache un paiement à une facture. */
  @Post(':paymentId/match')
  @RequirePermission('finance:write')
  async match(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: MatchPaymentDto,
  ): Promise<{ matched: true }> {
    await this.payments.match(await this.scope(user.userId), user.userId, paymentId, body.invoiceReadinessId)
    return { matched: true }
  }

  /** #2419.11 — noter un paiement en trop comme crédit dû au client (note interne, jamais un avoir émis). */
  @Post(':paymentId/customer-credit')
  @RequirePermission('finance:write')
  async noteCustomerCredit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: CustomerCreditDto,
  ): Promise<{ noted: true }> {
    await this.payments.noteCustomerCredit(await this.scope(user.userId), user.userId, paymentId, body.note)
    return { noted: true }
  }
}
