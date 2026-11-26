import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import { LocksModule } from '../locks/locks.module'
import { DependencyProbeService } from './dependency-probe.service'
import { HealthController } from './health.controller'
import { InternalDependencyHealthController } from './internal-dependency-health.controller'
import { OperatorHealthService } from './operator-health.service'
import { PgPoolWatchdogService } from './pg-pool-watchdog'
import { ReadinessService } from './readiness.service'
import { StatusController } from './status.controller'
import { StatusMonitorService } from './status.monitor'
import { StatusService } from './status.service'

/**
 * Liveness (`/health`, `/version`) + deploy readiness gate (`/health/ready`) +
 * public system status (`/status`) + the 5-min internal status monitor + la
 * grille des onze dépendances du back-office (`internal/health/dependencies`,
 * #1660).
 *
 * Self-contained (repo rule #7): DataSource comes from the global DatabaseModule,
 * the cron lock from LocksModule, and the worker-liveness registry read by
 * `ReadinessService` from the global WorkerReadinessModule.
 *
 * ⚠️ `ConnectorCapabilityProbeEntity` (et, depuis #2445.12,
 * `ConnectorCapabilityIncidentEntity`) sont déclarées ici parce que
 * `OperatorHealthService` les INJECTE — un repository injecté sans être déclaré
 * dans le module qui l'héberge fait échouer le démarrage, et c'est GA-20 qui le
 * tient. Une entité est un schéma partagé, pas un service : la déclarer ne
 * couple pas ce module à `tool-registry`.
 */
@Module({
  imports: [LocksModule, TypeOrmModule.forFeature([ConnectorCapabilityProbeEntity, ConnectorCapabilityIncidentEntity])],
  controllers: [HealthController, StatusController, InternalDependencyHealthController],
  providers: [
    StatusService,
    StatusMonitorService,
    ReadinessService,
    DependencyProbeService,
    OperatorHealthService,
    // INC-04-10 — relance le process quand le pool Postgres reste bloqué ≥ 3 min.
    PgPoolWatchdogService,
  ],
})
export class HealthModule {}
