import { Module } from '@nestjs/common'
import { AlertesInfraService } from './alertes-infra.service'
import { DisponibiliteService } from './disponibilite.service'
import { LectureDeFondService } from './lecture-de-fond.service'
import { PostgresActiviteService } from './postgres-activite.service'
import { PrometheusClient } from './prometheus.client'
import { RailwayClient } from './railway.client'
import { RailwaySupervisionService } from './railway.service'
import { SupabaseMetricsClient } from './supabase-metrics.client'
import { SupabaseSupervisionService } from './supabase.service'
import { SupervisionController } from './supervision.controller'
import { SupervisionService } from './supervision.service'

/**
 * Supervision de l'infra (onglet « Runners CI » d'abord ; Railway, Supabase et
 * disponibilité suivront). Module INDÉPENDANT : le retirer de `AppModule` ne
 * casse rien d'autre — aucun autre module ne l'importe.
 */
@Module({
  controllers: [SupervisionController],
  providers: [
    PrometheusClient,
    SupervisionService,
    SupabaseMetricsClient,
    SupabaseSupervisionService,
    RailwayClient,
    RailwaySupervisionService,
    DisponibiliteService,
    LectureDeFondService,
    AlertesInfraService,
    PostgresActiviteService,
  ],
})
export class SupervisionModule {}
