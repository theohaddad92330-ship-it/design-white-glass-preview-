import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { LocksModule } from '../locks/locks.module'
import { PlanCatalogModule } from './plan-catalog.module'
import { PlanPriceSyncService } from './plan-price-sync.service'

/**
 * Provides {@link PlanPriceSyncService} — the propagation of an operator's plan
 * price edit onto subscriptions already running on that plan.
 *
 * Kept as its own small module rather than folded into `PlanCatalogModule`: the
 * catalog is imported by enforcement paths (credits, workspace, analytics) that
 * have no business pulling in a Stripe writer and the `subscriptions` repository.
 * `StripeService` comes from the global `StripeModule`, so it needs no import.
 *
 * Self-contained (repo rule #7): removing this module and the single call in
 * `AdminService.updatePlan` restores the previous behaviour — an edited price
 * that only ever reaches new checkouts.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity]), PlanCatalogModule, LocksModule],
  providers: [PlanPriceSyncService],
  exports: [PlanPriceSyncService],
})
export class PlanPriceSyncModule {}
