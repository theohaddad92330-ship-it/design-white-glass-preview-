import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { createZodDto } from 'nestjs-zod'
import {
  can,
  generateOutgoingPaymentSchema,
  outgoingPaymentsQuerySchema,
  redactFinance,
  rejectOutgoingPaymentSchema,
  remindOutgoingPaymentsSchema,
  settleOutgoingPaymentSchema,
  validateOutgoingPaymentSchema,
  type OutgoingPayment,
  type OutgoingPaymentsPage,
  type RemindOutgoingPaymentsResult,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { OutgoingPaymentsService } from './outgoing-payments.service'
import { outgoingPaymentsToCsv } from './outgoing-payments-export'
import { DataExit } from '../workspace/data-exit.decorator'

class PaymentsQueryDto extends createZodDto(outgoingPaymentsQuerySchema) {}
class GeneratePaymentDto extends createZodDto(generateOutgoingPaymentSchema) {}
class ValidatePaymentDto extends createZodDto(validateOutgoingPaymentSchema) {}
class SettlePaymentDto extends createZodDto(settleOutgoingPaymentSchema) {}
class RejectPaymentDto extends createZodDto(rejectOutgoingPaymentSchema) {}
class RemindPaymentsDto extends createZodDto(remindOutgoingPaymentsSchema) {}

/**
 * LES PAIEMENTS SORTANTS — l'argent qui SORT vers le consultant.
 *
 * ⚠️ **Aucune route n'émet d'ordre de virement, et il n'y en aura pas.** Bellum
 * ne signe rien, ne paie rien et ne stocke aucun IBAN — le refus est écrit
 * trois fois dans le dépôt et ce lot ne le lève pas. Ce contrôleur SUIT un
 * paiement : il dit où il en est, ce qui le bloque et quel geste HUMAIN vient
 * ensuite. Le virement se fait dans la banque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PORTES, ET POURQUOI ELLES DIFFÈRENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Même arbitrage que `InvoiceReadinessController`, appliqué au sens inverse :
 *
 *  - **la LECTURE porte `@WorkspaceRead`, jamais `@RequirePermission`** — un
 *    gestionnaire de delivery doit pouvoir lire « relevé non validé » et
 *    « facture manquante » pour aller les chercher, sans connaître pour autant
 *    ce qu'on doit à chacun. C'est le CHAMP qui se garde, pas la liste, et
 *    `redactFinance` le vide (D45). La réponse porte `canReadFinance` : sans
 *    lui, « pas ton périmètre » et « montant non renseigné » seraient le même
 *    `null`.
 *    ⚠️ **Régression vécue (97ab491d9, 31/08/2026)** : le cliquet GA-05 avait
 *    fait rougir cette route un jour où elle était encore nue, et la réponse
 *    de l'époque avait été d'y poser `@RequirePermission('finance:read')`
 *    plutôt que le marqueur qui venait d'être inventé pour exactement ce cas
 *    (`GET /delivery/accounts/:accountId/missions`, même jour). Résultat :
 *    quiconque sans `finance:read` recevait un 403 plein, et le repli
 *    « nombres seulement » que cet écran sait pourtant rendre
 *    (`financeHidden` côté client) n'était jamais atteint — exactement le
 *    trou que ce lot referme sur `/factoring` ;
 *  - **chaque ÉCRITURE exige `finance:write`.** Faire avancer un paiement, le
 *    refuser ou constater qu'il est sorti engage l'argent de l'ESN — c'est
 *    exactement la frontière que « marquer payé » tient déjà côté client.
 *
 * ⚠️ **`finance:read` PLEIN et jamais `finance:read:own`** pour l'export : cette
 * liste n'a pas de périmètre par porteur, elle rend le mois de tout l'espace.
 * Ouvrir sur `:own` servirait l'argent de l'ESN entière à qui n'a droit qu'au
 * sien — le défaut exact que l'arbitrage de `InvoiceReadinessController` nomme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTE DE L'ÉCRITURE — geste d'UTILISATEUR, donc auto-approuvé
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les écritures d'ici sont des clics : le clic EST la décision, et rien
 * n'a à être prévisualisé ni à expirer. **Il n'y a AUCUN geste de SYSTÈME dans
 * ce module** — pas de routine, pas de job, pas de kill-switch, parce qu'il n'y
 * a rien qui s'exécute tout seul. Le jour où l'un d'eux naîtra, il passera par
 * une demande visible avec sa prévisualisation FIGÉE, comme les écritures
 * CRM/ERP ; l'absence de code est ce qui le garantit aujourd'hui.
 */
@Controller('payments/outgoing')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutgoingPaymentsController {
  constructor(
    private readonly payments: OutgoingPaymentsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * L'espace ET le droit financier, résolus ENSEMBLE et en un seul endroit.
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre sont ADDITIVES, et les ignorer rendrait sans effet un
   * droit qu'un responsable a explicitement donné.
   */
  private async financeContext(userId: string): Promise<{ workspaceId: string; canReadFinance: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return { workspaceId, canReadFinance: can(role, extra, 'finance:read') }
  }

  /**
   * La ligne rendue APRÈS un geste, rédigée selon le droit de son AUTEUR.
   *
   * Une porte dérobée par la réponse d'un POST est exactement le genre de fuite
   * qu'aucun écran ne montre : sans cette rédaction, la réponse du geste
   * rendrait un montant que l'écran vient de masquer.
   */
  private async redacted(
    userId: string,
    gesture: (context: { workspaceId: string }) => Promise<OutgoingPayment>,
  ): Promise<OutgoingPayment> {
    const { workspaceId, canReadFinance } = await this.financeContext(userId)
    return redactFinance(await gesture({ workspaceId }), canReadFinance)
  }

  /**
   * Le mois, consultant par consultant.
   *
   * ⚠️ La réponse est un état QUALIFIÉ, jamais un tableau nu : elle porte le
   * MOIS qu'elle a lu, ses quatre totaux et `canReadFinance`. Sans eux, un
   * écran vide se lirait « rien à payer » aussi bien que « mauvais mois » ou
   * « tu n'as pas le droit de voir les montants » — trois pannes qui ne se
   * réparent pas de la même façon. « Une erreur se remarque, une liste vide se
   * croit. »
   */
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: PaymentsQueryDto): Promise<OutgoingPaymentsPage> {
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    return this.payments.list(workspaceId, query, { canReadFinance })
  }

  /**
   * L'export du mois, en CSV.
   *
   * ⚠️ REFUSÉ sans `finance:read`, là où l'écran se contente de RÉDIGER — et ce
   * n'est pas une incohérence, c'est la différence entre les deux objets.
   * L'écran sert d'abord des états et des gestes, dont le montant n'est qu'une
   * colonne ; ce fichier n'existe QUE pour les montants. Un CSV dont on aurait
   * vidé cette colonne partirait quand même chez un comptable, par mail, et se
   * lirait comme un fichier complet où tout serait à zéro. Refuser dit la
   * vérité ; rédiger, ici, mentirait.
   */
  @Get('export.csv')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @RequirePermission('finance:read')
  async exportCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PaymentsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    // Le droit est déjà tenu par le garde ci-dessus ; il est RE-résolu ici
    // uniquement parce que `list` l'exige, et il vaut donc toujours `true`.
    const { workspaceId, canReadFinance } = await this.financeContext(user.userId)
    const { items, month } = await this.payments.list(workspaceId, query, { canReadFinance })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="paiements-${month}.csv"`)
    return outgoingPaymentsToCsv(items)
  }

  /**
   * PRÉPARER le paiement d'un mois — `non_genere` → `a_valider`.
   *
   * `finance:write` : il ne fait sortir aucun euro, mais il matérialise une
   * dette de l'ESN avec son montant, et c'est déjà un objet financier.
   */
  @Post('generate')
  @RequirePermission('finance:write')
  async generate(@CurrentUser() user: CurrentUserPayload, @Body() body: GeneratePaymentDto): Promise<OutgoingPayment> {
    return this.redacted(user.userId, context => this.payments.generate(context.workspaceId, user.userId, body))
  }

  /** ASSUMER le paiement — `a_valider` → `valide`. Le clic EST la décision. */
  @Post(':paymentId/validate')
  @RequirePermission('finance:write')
  async validate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ValidatePaymentDto,
  ): Promise<OutgoingPayment> {
    return this.redacted(user.userId, context =>
      this.payments.validate(context.workspaceId, user.userId, paymentId, body),
    )
  }

  /**
   * CONSTATER le paiement — `valide` → `paye`.
   *
   * Bellum ne rapproche aucun compte bancaire (D33) : cette route enregistre ce
   * qu'un humain constate, elle ne fait partir aucun virement.
   */
  @Post(':paymentId/settle')
  @RequirePermission('finance:write')
  async settle(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: SettlePaymentDto,
  ): Promise<OutgoingPayment> {
    return this.redacted(user.userId, context => this.payments.settle(context.workspaceId, paymentId, body))
  }

  /** REFUSER le paiement — le motif est OBLIGATOIRE (contrat + contrainte SQL). */
  @Post(':paymentId/reject')
  @RequirePermission('finance:write')
  async reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: RejectPaymentDto,
  ): Promise<OutgoingPayment> {
    return this.redacted(user.userId, context => this.payments.reject(context.workspaceId, paymentId, body))
  }

  /**
   * CONSIGNER une relance sur un LOT — le bouton « Relancer les paiements ».
   *
   * ⚠️ **Rien ne part d'ici.** Le mécanisme d'envoi gouverné du dépôt est
   * `POST /mailbox/batch` (idempotent, boîte personnelle, opt-out, arrêt après
   * trois échecs) ; ce lot n'en écrit pas un second et ne l'appelle pas. Le
   * produit CONSIGNE ce qu'un humain a fait — c'est la même doctrine que la
   * relance d'encaissement, et c'est ce qui manquait vraiment : le geste
   * existait ligne par ligne, jamais sur les lignes qu'on a sous les yeux.
   *
   * `records:write` et non `finance:write` : consigner une relance ne fait
   * bouger aucun montant et ne fait avancer aucun état — c'est tenir une fiche.
   * Même arbitrage que `recordReminder` côté encaissement.
   */
  @Post('remind')
  @RequirePermission('records:write')
  async remind(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: RemindPaymentsDto,
  ): Promise<RemindOutgoingPaymentsResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.payments.remind(workspaceId, body.paymentIds)
  }
}
