import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AlertesInfraService, type IncidentsServis } from './alertes-infra.service'
import { DisponibiliteService, type SupervisionDisponibilite } from './disponibilite.service'
import { LectureDeFondService, type RailwayServi, type SupabaseServi } from './lecture-de-fond.service'
import { PostgresActiviteService, type ReleveActivite } from './postgres-activite.service'
import { SupervisionService, type SupervisionRunners } from './supervision.service'

/**
 * Supervision de l'infra, lue par le back-office (dashboard-manager) seulement.
 * Même préfixe et même garde que {@link AdminQueuesController} : secret interne
 * en en-tête, aucun JWT utilisateur. Retirer la garde exposerait la charge de la
 * flotte CI à n'importe qui — elle ne se retire jamais.
 *
 * Aucune requête PromQL ne vient de l'appelant : chaque route assemble des
 * identifiants de la liste blanche de `prometheus.client.ts`.
 */
@Controller('internal/admin/supervision')
@UseGuards(InternalSecretGuard)
export class SupervisionController {
  constructor(
    private readonly supervision: SupervisionService,
    private readonly lectureDeFond: LectureDeFondService,
    private readonly disponibiliteSupervision: DisponibiliteService,
    private readonly alertes: AlertesInfraService,
    private readonly postgresActiviteReleve: PostgresActiviteService,
  ) {}

  /** Onglet « Disponibilité » : sondes externes des runners + commit servi. */
  @Get('disponibilite')
  disponibilite(): Promise<SupervisionDisponibilite> {
    return this.disponibiliteSupervision.disponibilite()
  }

  @Get('runners')
  runners(): Promise<SupervisionRunners> {
    return this.supervision.runners()
  }

  /** Onglet « Base Supabase » : dernière lecture de fond, aucun appel réseau à la requête. */
  @Get('supabase')
  supabase(): Promise<SupabaseServi> {
    return this.lectureDeFond.supabase()
  }

  /** Onglet « Railway » : `?fenetre=1h|24h|7j` (24h = lecture de fond ; 1h/7j à la demande). */
  @Get('railway')
  railway(@Query('fenetre') fenetre?: string): Promise<RailwayServi> {
    return this.lectureDeFond.railway(fenetre)
  }

  /** Bloc « Incidents infra ouverts » : lu dans Redis ; Redis injoignable ⇒ `illisible`, jamais « aucun ». */
  @Get('incidents')
  incidents(): Promise<IncidentsServis> {
    return this.alertes.incidents()
  }

  /**
   * Incident pool du 04/10/2026 — `pg_stat_activity` AGRÉGÉ (nombre par état et
   * par type d'attente, « idle in transaction » > 30 s, plus vieille transaction),
   * lu par la connexion directe hors pooler, cache 60 s. Jamais le texte d'une
   * requête. Base injoignable ⇒ `illisible` avec la raison, jamais un relevé vide.
   */
  @Get('postgres-activite')
  postgresActivite(): Promise<ReleveActivite> {
    return this.postgresActiviteReleve.releve()
  }
}
