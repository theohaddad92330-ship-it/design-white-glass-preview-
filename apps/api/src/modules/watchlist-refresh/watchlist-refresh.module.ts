import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import {
  PublicRegistryAnnouncementEntity,
  PublicRegistryWatchStateEntity,
  SireneSnapshotEntity,
} from '../../database/entities/public-registry.entity'
import { AnalysisModule } from '../analysis/analysis.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { LocksModule } from '../locks/locks.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WatchlistRefreshScheduler } from './watchlist-refresh.scheduler'
import { WatchlistRefreshWorker } from './watchlist-refresh.worker'
import { WATCHLIST_REFRESH_QUEUE } from './watchlist-refresh.queue'
import { EsnRegistryRotation } from './esn-registry-rotation'
import { PublicRegistryWatch } from './public-registry-watch'
import { SignalAlertCap } from './signal-alert-cap'

/**
 * C4 — veille réelle (retour Théo p.12, PDF4 §12.3) : boucle quotidienne de
 * re-collecte des signaux des comptes suivis. Self-contained (règle #7):
 * removing this module removes the cron + queue and nothing else changes —
 * the manual per-dimension refresh and its billing stay in AnalysisModule.
 *
 * `@nestjs/schedule` is already bootstrapped app-wide (OutboxModule calls
 * `ScheduleModule.forRoot()`), so the scheduler's `@Cron` is discovered by the
 * running API process, exactly like the notifications crons.
 */
@Module({
  imports: [
    // The un-billed dimension-refresh mechanism (AnalysisOnDemandService).
    AnalysisModule,
    // notifyBuySignalForAccount — in-app + outbound integrations fan-out.
    NotificationsCoreModule,
    // Cron-tick lock (multi-replica safety).
    LocksModule,
    // #4016 L7 — le palier de l'espace, pour le plafond opérateur PAR PLAN.
    PlanFeaturesModule,
    // #2875 (#2402.1, #2402.3) — le registre canonique, pour le septième
    // émetteur migré (`signal_nouveau`).
    TriggerRegistryModule,
    // LUD.1 — le domaine de l'espace, pour lire les marchés de SON métier.
    EsnProfileModule,
    // #3916.a — les registres publics lus en continu (IaClient est global).
    TypeOrmModule.forFeature([
      AccountEntity,
      PublicRegistryAnnouncementEntity,
      PublicRegistryWatchStateEntity,
      // #3916.b — la procédure collective arme le risque du référentiel ESN.
      EsnDirectoryEntity,
      // #3921.a — le relevé Sirene du jour.
      SireneSnapshotEntity,
      // #3920.a — le compteur du plafond d'alertes.
      NotificationEntity,
    ]),
    BullModule.registerQueue({
      name: WATCHLIST_REFRESH_QUEUE,
      defaultJobOptions: {
        // One attempt: a failed refresh re-bills Claude/Firecrawl, so we never
        // auto-retry — tomorrow's tick picks the account up again (stalest-first).
        attempts: 1,
        // Keep completed jobs for 24h so the per-(account, day) jobId keeps
        // deduping replayed ticks for the whole day.
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800 },
      },
    }),
  ],
  // #3921.7 / #3915.15 — la relecture nocturne des ESN du référentiel, par roulement.
  providers: [
    WatchlistRefreshScheduler,
    WatchlistRefreshWorker,
    PublicRegistryWatch,
    SignalAlertCap,
    EsnRegistryRotation,
  ],
})
export class WatchlistRefreshModule {}
