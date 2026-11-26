import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessMetricSnapshotEntity } from '../../database/entities/business-metric-snapshot.entity'
import { BusinessMetricSnapshotLineEntity } from '../../database/entities/business-metric-snapshot-line.entity'
import { BusinessTreasuryMonthEntity } from '../../database/entities/business-treasury-month.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { PlanCatalogModule } from '../credits/plan-catalog.module'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { BusinessMetricsController } from './business-metrics.controller'
import { BusinessMetricsService } from './business-metrics.service'
import { BusinessMetricsSnapshotService } from './business-metrics-snapshot.service'
import {
  PLAN_GRIDS,
  SINGLETON_LOCK,
  type PlanGrids,
  type PlanGridsReader,
  type UnderSingletonLock,
} from './module-tokens'

/**
 * Les chiffres de BELLUM : MRR figé mois par mois, trésorerie saisie (#1645, #1649).
 *
 * ⚠️ `SubscriptionEntity` et `ManualBillingTermsEntity` sont ici en LECTURE
 * SEULE. Les modules `credits` et `admin` restent propriétaires de ces deux
 * tables et sont les seuls à les écrire ; ce module les photographie.
 *
 * ⚠️ La grille tarifaire arrive par un JETON, pas par un service injecté. GA-07
 * est un cliquet au plafond, et le MRR n'a pas besoin du catalogue : il a besoin
 * de deux dictionnaires de prix. La composition se fait donc ici — c'est
 * exactement ce à quoi sert un fichier de module. Voir `module-tokens.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessMetricSnapshotEntity,
      BusinessMetricSnapshotLineEntity,
      BusinessTreasuryMonthEntity,
      SubscriptionEntity,
      ManualBillingTermsEntity,
      // #1646.6 — lecture seule, pour nommer un `subject_id` sur le tableau
      // des mouvements par client (voir le docblock de `BusinessMetricsService`).
      WorkspaceEntity,
      ProfileEntity,
    ]),
    PlanCatalogModule,
    LocksModule,
  ],
  controllers: [BusinessMetricsController],
  providers: [
    BusinessMetricsService,
    BusinessMetricsSnapshotService,
    InternalSecretGuard,
    {
      provide: PLAN_GRIDS,
      inject: [PlanCatalogService],
      useFactory:
        (catalog: PlanCatalogService): PlanGridsReader =>
        async (): Promise<PlanGrids> => ({
          priceCents: await catalog.priceGridCents(),
          seatCents: await catalog.seatPriceGridCents(),
        }),
    },
    {
      provide: SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
  ],
})
export class BusinessMetricsModule {}
