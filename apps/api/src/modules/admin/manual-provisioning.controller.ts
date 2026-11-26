import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { BillingCalendar } from './manual-billing-calendar'
import { LogReminderDto, PrepareReminderQueryDto, SetInvoiceDisputeDto } from './dto/manual-billing-reminder.dto'
import {
  ProvisionClientDto,
  RecordManualInvoiceDto,
  UpdateBillingTermsDto,
  UpdateManualInvoiceDto,
} from './dto/provision-client.dto'
import type { ProvisioningPreview } from './manual-provisioning-plan'
import {
  ManualProvisioningService,
  type ManualClientRow,
  type ManualInvoiceRow,
  type ManualReminderView,
  type ProvisionClientResult,
} from './manual-provisioning.service'

/**
 * Sales-led client provisioning — the backoffice "Créer un client" flow.
 *
 * Same trust model as the rest of `internal/admin`: cross-tenant by design and
 * gated ONLY by the shared internal secret, which the dashboard-manager attaches
 * server-side. This controller creates auth accounts and grants quota, so the
 * guard is doing more work here than anywhere else in the module — it must never
 * be removed (`manual-provisioning.controller.spec.ts` fails the build if it is,
 * and the e2e spec proves an unauthenticated call is actually rejected).
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class ManualProvisioningController {
  constructor(private readonly provisioning: ManualProvisioningService) {}

  /**
   * Provision an invoice-billed client end to end: ESN workspace, owner account,
   * team invitations, plan, seats, quota and the offline commercial terms.
   *
   * Never touches Stripe and never sets a password. The response reports
   * `fullyNotified` and a per-invitation delivery outcome — the caller must show
   * a warning, not a success, when an email did not leave.
   */
  @Post('clients/provision')
  provisionClient(@Body() dto: ProvisionClientDto): Promise<ProvisionClientResult> {
    return this.provisioning.provisionClient(dto)
  }

  /**
   * LE RÉCAPITULATIF des six étapes, avant validation (#1665, règle 3 · T2).
   *
   * ⚠️ Un POST qui n'écrit RIEN. Le verbe dit « je t'envoie une charge utile à
   * examiner », pas « je crée » : la saisie est trop grosse pour une chaîne de
   * requête, et la faire voyager en `GET` mettrait l'adresse du propriétaire et
   * le montant du contrat dans les journaux d'accès de Vercel et de Railway.
   *
   * ⚠️ La route est `clients/provision/preview`, sous le chemin du geste
   * qu'elle décrit. Aucun `:param` du module ne peut la capturer :
   * `clients/manual/:workspaceId` porte le littéral `manual` en deuxième
   * segment, celle-ci porte `provision`. Nest ordonne par module, jamais par
   * spécificité — la e2e le PROUVE plutôt que de le supposer.
   */
  @Post('clients/provision/preview')
  previewProvisioning(@Body() dto: ProvisionClientDto): Promise<ProvisioningPreview> {
    return this.provisioning.previewProvisioning(dto)
  }

  /**
   * Every invoice-billed client, its invoice ledger and its derived health —
   * what is late and by how long. Read-only.
   */
  @Get('clients/manual')
  listManualClients(): Promise<ManualClientRow[]> {
    return this.provisioning.listManualClients()
  }

  /**
   * The same clients as a TWELVE-MONTH CALENDAR — one row per client, one
   * column per month, one cell per period (#1653). Read-only.
   *
   * ⚠️ The path is `clients/manual-calendar`, NOT `clients/manual/calendar`:
   * `clients/manual/:workspaceId` already owns that shape, and Nest orders
   * routes by module rather than by specificity — a literal captured by a
   * neighbouring `:id` is a defect this repository has already paid for. Two
   * segments, no family, nothing to arbitrate.
   *
   * `month` (`YYYY-MM`) is the last month shown. Absent, illegible or in the
   * future, the derivation falls back to the current month rather than
   * throwing: a hand-retyped URL must not break an operator's screen.
   */
  @Get('clients/manual-calendar')
  listBillingCalendar(@Query('month') month?: string): Promise<BillingCalendar> {
    return this.provisioning.listBillingCalendar(month)
  }

  /**
   * Correct the CONTRACT: commitment length, who the invoice is made out to,
   * its reference. Payment moved to the invoice ledger below — a period that
   * was never invoiced has no payment to declare.
   *
   * ⚠️ Declared BEFORE the invoice routes on purpose is not enough on its own:
   * `clients/manual/invoices/:id` has four segments and this has three, so
   * neither can capture the other. Nest orders by module, never by specificity.
   */
  @Patch('clients/manual/:workspaceId')
  updateTerms(@Param('workspaceId') workspaceId: string, @Body() dto: UpdateBillingTermsDto): Promise<ManualClientRow> {
    return this.provisioning.updateTerms(workspaceId, dto)
  }

  /** The invoices emitted for one client, most recent period first. */
  @Get('clients/manual/:workspaceId/invoices')
  listInvoices(@Param('workspaceId') workspaceId: string): Promise<ManualInvoiceRow[]> {
    return this.provisioning.listInvoices(workspaceId)
  }

  /**
   * Record an invoice emitted in the accounting tool. This is what makes
   * « aucune facture depuis l'échéance » a measurable fact rather than a
   * feeling — the app still emits no document and chases no payment.
   */
  @Post('clients/manual/:workspaceId/invoices')
  recordInvoice(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RecordManualInvoiceDto,
  ): Promise<ManualInvoiceRow> {
    return this.provisioning.recordInvoice(workspaceId, dto)
  }

  /** Cash an invoice in, or fix a mistyped reference/period. No delete. */
  @Patch('clients/manual/invoices/:invoiceId')
  updateInvoice(@Param('invoiceId') invoiceId: string, @Body() dto: UpdateManualInvoiceDto): Promise<ManualInvoiceRow> {
    return this.provisioning.updateInvoice(invoiceId, dto)
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * LA RELANCE D'UNE PÉRIODE EN RETARD (#1655)
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ Le préfixe littéral est `clients/manual-reminder` / `clients/manual-
   * invoices`, avec un TRAIT D'UNION — jamais `clients/manual/...`. La famille
   * `clients/manual/:workspaceId` existe déjà, et Nest ordonne les routes par
   * MODULE, pas par spécificité : un littéral capturé par le `:id` d'un voisin
   * est un défaut que ce dépôt a déjà payé (GA-178). Deux préfixes distincts,
   * rien à arbitrer.
   *
   * ⚠️ AUCUNE DE CES ROUTES N'ENVOIE UN MESSAGE. La première PRÉPARE un texte,
   * la deuxième CONSIGNE qu'un humain l'a envoyé, la troisième déclare un
   * litige. Il n'existe dans ce lot aucun chemin vers un fournisseur de
   * messagerie — c'est mesuré, pas promis
   * (`manual-billing-reminder-no-send.spec.ts`).
   */

  /**
   * La relance PRÉPARÉE pour une période, ou le refus qui dit pourquoi il n'y en
   * a pas : facture absente, encaissée, EN LITIGE, cadence épuisée, pas encore
   * due, ou une donnée manquante — nommée.
   *
   * Lecture seule. `tone` force le ton ; absent, c'est la cadence qui décide.
   */
  @Get('clients/manual-reminder')
  prepareReminder(@Query() query: PrepareReminderQueryDto): Promise<ManualReminderView> {
    return this.provisioning.prepareInvoiceReminder(query.workspaceId, query.periodStart, query.tone)
  }

  /**
   * Consigner une relance qu'un humain vient d'envoyer — sa date et son auteur
   * (#1655, règle 4).
   *
   * Rejoue la préparation et REFUSE tout ce que l'écran refuse : une porte plus
   * large que le flux qu'elle garde ne garde rien.
   */
  @Post('clients/manual-invoices/:invoiceId/reminder')
  logReminder(@Param('invoiceId') invoiceId: string, @Body() dto: LogReminderDto): Promise<ManualInvoiceRow> {
    return this.provisioning.logInvoiceReminder(invoiceId, dto)
  }

  /**
   * Déclarer un litige sur une facture, ou le lever. C'est LA porte de la règle
   * « aucune relance sur une facture en litige » : sans elle, l'état existerait
   * en base sans qu'aucun humain puisse le poser.
   */
  @Patch('clients/manual-invoices/:invoiceId/dispute')
  setInvoiceDispute(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SetInvoiceDisputeDto,
  ): Promise<ManualInvoiceRow> {
    return this.provisioning.setInvoiceDispute(invoiceId, dto)
  }
}
