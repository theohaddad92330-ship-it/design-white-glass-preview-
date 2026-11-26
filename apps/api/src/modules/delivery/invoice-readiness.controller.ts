import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  can,
  invoiceBlockerSchema,
  invoiceReadinessQuerySchema,
  collectionsExportQuerySchema,
  markInvoicedSchema,
  recordPaymentSchema,
  cancelInvoicedSchema,
  disputeInvoiceSchema,
  redactFinance,
  type InvoiceReadiness,
  type ReadinessSummary,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { InvoiceReadinessService } from './invoice-readiness.service'
import { readinessToCsv, collectionsToCsv } from './readiness-export'
import { DataExit } from '../workspace/data-exit.decorator'

class ReadinessQueryDto extends createZodDto(invoiceReadinessQuerySchema) {}
class CollectionsExportQueryDto extends createZodDto(collectionsExportQuerySchema) {}
class MarkInvoicedDto extends createZodDto(markInvoicedSchema) {}
class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class CancelInvoicedDto extends createZodDto(cancelInvoicedSchema) {}
class DisputeInvoiceDto extends createZodDto(disputeInvoiceSchema) {}

const recordReminderSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    blockers: z.array(invoiceBlockerSchema).max(10).default([]),
  })
  .strict()
class RecordReminderDto extends createZodDto(recordReminderSchema) {}

/**
 * Revenue Protection — ce qui empêche de facturer.
 *
 * Aucune route n'émet de facture, et il n'y en aura pas : une facture engage une
 * numérotation continue et une obligation de conservation. Le produit s'arrête à
 * « prêt à facturer », et le dit.
 */
@Controller('delivery/invoice-readiness')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class InvoiceReadinessController {
  constructor(
    private readonly readiness: InvoiceReadinessService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Un seul endroit résout l'espace actif. */
  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * L'espace ET le droit financier, résolus ENSEMBLE et en un seul endroit.
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre sont additives, et les ignorer rendrait sans effet un
   * droit qu'un responsable a explicitement donné — le défaut trouvé sur la
   * liste des missions le 22/08.
   *
   * `finance:read` PLEIN et non `finance:read:own` : cette liste n'a pas de
   * périmètre par porteur — elle rend le mois de tout l'espace. Ouvrir sur
   * `finance:read:own` servirait donc l'argent de l'ESN entière à qui n'a droit
   * qu'au sien, ce qui est exactement le défaut qu'on corrige. Même raison que
   * `dso`, `capacity` et `margin-by-channel`.
   */
  private async financeContext(userId: string): Promise<{ workspaceId: string; canReadFinance: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return { workspaceId, canReadFinance: can(role, extra, 'finance:read') }
  }

  /**
   * La ligne rendue APRÈS un geste d'écriture, rédigée selon le droit de son
   * AUTEUR.
   *
   * « Marquer comme facturé » est ouvert à `records:write` (D36), c'est-à-dire à
   * un `sales` qui n'a pas `finance:read` : sans cette rédaction, la réponse du
   * geste lui rendrait le montant préparé et le montant encaissé du mois que
   * l'écran, lui, vient de lui masquer. Une porte dérobée par la réponse d'un
   * POST est exactement le genre de fuite qu'aucun écran ne montre.
   *
   * `redactFinance` et pas un ternaire écrit à la main (D45) : le champ reste
   * PRÉSENT et vide, jamais retiré et jamais à zéro.
   */
  private async redacted(
    userId: string,
    gesture: (context: { workspaceId: string }) => Promise<InvoiceReadiness>,
  ): Promise<InvoiceReadiness> {
    const { workspaceId, canReadFinance } = await this.financeContext(userId)
    return redactFinance(await gesture({ workspaceId }), canReadFinance)
  }

  /**
   * L'état du mois.
   *
   * ⚠️ Pas de `@RequirePermission` — et c'est délibéré : la LISTE est légitime
   * pour tout le monde, c'est le champ financier qui se garde, pas la lecture.
   * Un gestionnaire de delivery doit pouvoir lire « relevé manquant » et « pas
   * de bon de commande » pour aller les chercher ; il n'a pas à connaître pour
   * autant ce que le mois vaut. Même arbitrage que `GET /delivery/missions`.
   *
   * ⚠️ La réponse porte `canReadFinance` : depuis que les montants valent `null`
   * dans les deux cas, c'est le seul moyen pour l'écran de dire « pas ton
   * périmètre » plutôt que « mois non chiffrable ».
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReadinessQueryDto,
  ): Promise<{
    items: InvoiceReadiness[]
    summary: ReadinessSummary
    month: string
    canReadFinance: boolean
  }> {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    return this.readiness.list(workspaceId, query, { canReadFinance })
  }

  /**
   * La fenêtre d'encaissements en un appel (`?months=AAAA-MM,…`, 24 au plus) : mêmes lignes que
   * `GET /` mois par mois, même redaction financière. Déclarée AVANT toute route paramétrée.
   * Lecture d'espace : le champ financier reste rédigé par `canReadFinance` comme `GET /`.
   */
  @WorkspaceRead()
  @Get('collections')
  async collections(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CollectionsExportQueryDto,
  ): Promise<{ items: InvoiceReadiness[]; canReadFinance: boolean }> {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    return this.readiness.listWindow(workspaceId, query.months.split(','), { canReadFinance })
  }

  /**
   * Les relances DUES. Le produit les liste ; il n'en envoie aucune.
   *
   * ⚠️ Chaque entrée porte l'`item` ENTIER, montants compris : le droit
   * financier voyage donc jusqu'ici, et la réponse le porte — même raison que
   * la liste. Cette route n'avait, elle non plus, aucune permission déclarée.
   */
  @Get('reminders')
  async reminders(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    const items = await this.readiness.dueReminders(workspaceId, { month, canReadFinance })
    return { items, canReadFinance }
  }

  /**
   * L'export du mois, en CSV.
   *
   * Il part chez un comptable : point-virgule, BOM, montants en euros. Aucune
   * ligne n'est recalculée ici — un export qui produirait des chiffres
   * différents de l'écran ferait douter des deux.
   *
   * ⚠️ REFUSÉ sans `finance:read`, là où l'écran se contente de RÉDIGER. Ce
   * n'est pas une incohérence, c'est la différence entre les deux objets :
   * l'écran sert d'abord des bloqueurs et le montant n'en est qu'une colonne,
   * tandis que ce fichier n'existe QUE pour le montant — sa colonne centrale
   * s'appelle « Montant préparatoire (€) ». Un CSV dont on aurait vidé cette
   * colonne partirait quand même chez un comptable, par mail, et se lirait
   * comme un fichier complet où tout serait à zéro. Refuser dit la vérité ;
   * rédiger, ici, mentirait.
   *
   * `finance:read` seul, sans `finance:read:own` : l'export porte le mois de
   * tout l'espace et ne sait pas se restreindre à un portefeuille.
   */
  @Get('export.csv')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @RequirePermission('finance:read')
  async exportCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReadinessQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    // Le droit est déjà tenu par le garde ci-dessus ; il est RE-résolu ici
    // uniquement parce que `list` l'exige, et il vaut donc toujours `true`.
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    const { items, month } = await this.readiness.list(workspaceId, query, { canReadFinance })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="facturation-${month}.csv"`)
    return readinessToCsv(items)
  }

  /**
   * #2198.45 — L'export de l'écran « encaissements ».
   *
   * `months` vient du NAVIGATEUR, qui a déjà calculé sa fenêtre glissante de
   * douze mois (`collections.ts`) — le serveur ne fait que la reparcourir, un
   * mois à la fois, jamais recalculer une fenêtre qui pourrait diverger de ce
   * que l'écran affiche à l'instant de l'export.
   *
   * Même garde que `export.csv` ci-dessus, même raison : c'est un CSV de
   * montants, un lecteur sans `finance:read` recevrait un fichier vidé de sa
   * seule colonne utile, et se lirait comme un fichier complet.
   */
  @Get('collections-export.csv')
  @DataExit()
  @RequirePermission('finance:read')
  async exportCollectionsCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CollectionsExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    const months = query.months.split(',')
    const items = await this.readiness.exportCollections(workspaceId, months, { canReadFinance })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="encaissements.csv"')
    return collectionsToCsv(items)
  }

  /**
   * Marquer un mois comme facturé AILLEURS.
   *
   * Ouvert à `finance:write` EN PLUS de `records:write` (D36) : le nouveau
   * rôle Finance doit pouvoir le faire, et les sièges historiques qui le
   * faisaient déjà ne perdent rien — le dépôt a explicitement refusé, sur le
   * socle, un changement de rôle qui aurait révoqué des droits acquis.
   */
  @Post(':missionId/invoiced')
  @RequirePermission('records:write', 'finance:write')
  async markInvoiced(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Query('month') month: string,
    @Body() body: MarkInvoicedDto,
  ): Promise<InvoiceReadiness> {
    return this.redacted(user.userId, context =>
      this.readiness.markInvoiced(context.workspaceId, user.userId, missionId, month, body),
    )
  }

  /**
   * Enregistre un PAIEMENT reçu.
   *
   * ⚠️ Le geste qui manquait : `paid_at` était LU par le chiffre d'affaires
   * encaissé et par le délai de paiement, et écrit par RIEN — les deux mesures
   * étaient donc structurellement vides. Bellum ne rapproche aucun compte
   * bancaire (D33) : il enregistre ce que quelqu'un CONSTATE.
   *
   * `finance:write` seul : constater un encaissement n'est pas tenir une fiche.
   */
  @Post(':missionId/paid')
  @RequirePermission('finance:write')
  async recordPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Query('month') month: string,
    @Body() body: RecordPaymentDto,
  ): Promise<InvoiceReadiness> {
    return this.redacted(user.userId, context =>
      this.readiness.recordPayment(context.workspaceId, missionId, month, body, user.userId),
    )
  }

  /**
   * Annule un « marqué comme facturé » posé par erreur.
   *
   * Le motif est OBLIGATOIRE — le contrat le refuse vide, et la contrainte SQL
   * aussi. La marque n'est pas effacée : elle est annulée AVEC sa trace, parce
   * que « une facture a été annoncée puis retirée » est justement ce qu'il faut
   * pouvoir relire.
   */
  @Post(':missionId/invoiced/cancel')
  @RequirePermission('finance:write')
  async cancelInvoiced(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Query('month') month: string,
    @Body() body: CancelInvoicedDto,
  ): Promise<InvoiceReadiness> {
    return this.redacted(user.userId, context =>
      this.readiness.cancelInvoiced(context.workspaceId, user.userId, missionId, month, body.reason),
    )
  }

  /**
   * DÉCLARE un litige sur la facture d'un mois — BEL-MIS-011.
   *
   * **Le litige n'est pas un retard.** Les deux colonnes existaient depuis des
   * mois, avec leur effet écrit dans l'entité, et aucun chemin ne les écrivait :
   * une contestation se gérait donc en annulant le « facturé », après quoi le
   * mois repartait dans les relances — on relançait un client qui conteste.
   *
   * Le motif est OBLIGATOIRE (le contrat le refuse vide, la contrainte SQL
   * aussi), et la permission est celle de l'annulation d'un « facturé » : ce
   * geste change ce qu'on réclame et ce qu'on mesure.
   */
  @Post(':missionId/dispute')
  @RequirePermission('finance:write')
  async openDispute(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Query('month') month: string,
    @Body() body: DisputeInvoiceDto,
  ): Promise<InvoiceReadiness> {
    return this.redacted(user.userId, context =>
      this.readiness.openDispute(context.workspaceId, missionId, month, body.reason),
    )
  }

  /**
   * LÈVE le litige — la contestation est réglée, les relances peuvent reprendre.
   *
   * Aucun motif demandé : la fin d'un litige n'a rien à justifier, et exiger une
   * phrase pour clore ferait laisser des litiges ouverts. La trace du litige,
   * elle, ne s'efface pas — c'est elle qui explique le délai.
   */
  @Post(':missionId/dispute/resolve')
  @RequirePermission('finance:write')
  async resolveDispute(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Query('month') month: string,
  ): Promise<InvoiceReadiness> {
    return this.redacted(user.userId, context => this.readiness.resolveDispute(context.workspaceId, missionId, month))
  }

  /** Trace une relance PARTIE — jamais déduite : compter une relance qu'on n'a
   *  pas envoyée ferait taire la suivante, et le mois passerait. */
  @Post(':missionId/reminder')
  @RequirePermission('records:write')
  async recordReminder(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: RecordReminderDto,
  ): Promise<{ recorded: true }> {
    await this.readiness.recordReminder(await this.scope(user.userId), missionId, body.month, body.blockers)
    return { recorded: true }
  }
}
