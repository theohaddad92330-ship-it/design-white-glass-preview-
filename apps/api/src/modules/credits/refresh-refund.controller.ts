import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { RefreshRefundDto } from './dto/refresh-refund.dto'
import { RefreshRefundService, type RefreshRefundOutcome } from './refresh-refund.service'

/**
 * #2650.2 (19/09/2026) — LA SEULE PORTE du remboursement des rafraîchissements
 * d'axe déjà payés dans les 6 h (débits pris avant le correctif #2650.1).
 *
 * Même famille que les gestes de facturation du back-office (`AdminUsers
 * Controller.grantCredits`, `OfferEconomicsController`) : préfixe
 * `internal/admin`, {@link InternalSecretGuard} — sans le secret interne,
 * y compris pour un utilisateur connecté, c'est un 403. Le garde ne doit
 * jamais être retiré : le geste crédite le pool d'un espace client.
 *
 * Rien d'autre dans le dépôt n'appelle `RefreshRefundService.run` : ni un
 * `onApplicationBootstrap`, ni une routine planifiée, ni le déploiement. Le
 * geste se lance à la main, `dryRun` d'abord (défaut), puis `dryRun: false`.
 *
 * Il vit dans le module `credits`, et pas dans `admin`, pour la raison écrite
 * sur `OfferEconomicsController` : il lit et écrit les deux tables de ce
 * module (`credit_ledger`, `subscriptions`), et GA-07 est au plafond.
 */
@Controller('internal/admin/credits/refresh-refunds')
@UseGuards(InternalSecretGuard)
export class RefreshRefundController {
  constructor(private readonly refunds: RefreshRefundService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: RefreshRefundDto): Promise<RefreshRefundOutcome> {
    return this.refunds.run(dto.workspaceId, { dryRun: dto.dryRun, actor: dto.actor ?? 'backoffice' })
  }
}
