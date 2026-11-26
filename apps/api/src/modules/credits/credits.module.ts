import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { LocksModule } from '../locks/locks.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
// #2975 — la porte de coût par espace, appelée AVANT de débiter une analyse
// ou un enrichissement (`CreditsService.consumeAnalysisSlot`/
// `consumeEnrichmentCredit`). Module autonome (règle 7) : ni lui ni
// `AdminModule` ne référence `CreditsModule` en retour, donc aucun cycle.
import { WorkspaceBudgetModule } from '../workspace-budget/workspace-budget.module'
import { CreditsController } from './credits.controller'
import { CreditsService } from './credits.service'
import { OfferEconomicsController } from './offer-economics.controller'
import { OfferEconomicsService } from './offer-economics.service'
import { PlanCatalogModule } from './plan-catalog.module'
import { RefreshRefundController } from './refresh-refund.controller'
import { EnrichmentDiagnosticController } from './enrichment-diagnostic.controller'
import { RefreshRefundService } from './refresh-refund.service'
import { RefreshRefundSweepService } from './refresh-refund-sweep.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      CreditLedgerEntity,
      AccountEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      StripeEventEntity,
      // Ce qui est PROMIS et pas encore dépensé. Sans cette ligne, l'injection
      // échoue au DÉMARRAGE (GA-20) — ce qui est exactement le comportement
      // voulu : un solde qui oublierait les crédits en vol se remettrait à
      // promettre deux fois les mêmes, sans qu'un seul test ne tombe.
      CreditReservationEntity,
    ]),
    WorkspaceModule,
    // DB-backed editable plan catalog (replaced the PLAN_CONFIG const).
    PlanCatalogModule,
    // Cron-tick lock for the monthly quota reset (multi-replica safety).
    LocksModule,
    // In-app `credit_low` alert on debit (transparence billing) — the light
    // notifications core (service + repos), not the mailer/scheduler graph.
    NotificationsCoreModule,
    WorkspaceBudgetModule,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des déclencheurs
    // commerciaux : `maybeNotifyCreditLow` y persiste désormais AUSSI
    // `credit_low`, en plus de la notification in-app.
    TriggerRegistryModule,
  ],
  // `OfferEconomicsController` sert le catalogue AVEC ce que chaque offre
  // rapporte (issue 1656). Il est ici, et pas dans `admin`, parce que le calcul
  // lit le catalogue et les abonnements — les deux tables de ce module — et que
  // GA-07 est au plafond : le poser ailleurs aurait demandé un import de
  // service de plus. Il ne fait que LIRE ; l'écriture du catalogue reste sur
  // `PATCH /internal/admin/plans/:key`.
  // #2650.2 — `RefreshRefundController` rembourse les rafraîchissements déjà
  // payés dans les 6 h, espace par espace, derrière le secret interne. Ici
  // pour la même raison qu'`OfferEconomicsController` : il écrit les deux
  // tables de ce module (`credit_ledger`, `subscriptions`).
  // #2650.2 (21/09/2026) — `RefreshRefundSweepService` est l'APPELANT nocturne
  // de `RefreshRefundService.run` (`@Cron`, `LocksModule` importé ci-dessus
  // pour son verrou de tick multi-réplique) : sans lui le remboursement ne
  // partait qu'à la main, derrière le contrôleur.
  controllers: [CreditsController, OfferEconomicsController, RefreshRefundController, EnrichmentDiagnosticController],
  providers: [CreditsService, OfferEconomicsService, RefreshRefundService, RefreshRefundSweepService],
  exports: [CreditsService],
})
export class CreditsModule {}
