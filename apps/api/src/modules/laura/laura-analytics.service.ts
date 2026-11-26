import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm'
import { computeLauraAnalytics, type LauraAnalyticsSummary } from '@bellum/contracts'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'

/**
 * #2403.40-.47 — LE PONT ENTRE LES TRACES ET LES HUIT NOMS DU §5.3.
 *
 * Ce service ne CALCULE rien — `computeLauraAnalytics` (`@bellum/contracts`)
 * fait le calcul pur et porte sa propre doc sur ce qui est mesuré et ce qui
 * ne l'est pas. Ce fichier ne fait que LIRE : les traces sur une fenêtre
 * glissante d'AU MOINS trente jours (même borne que `LauraAcceptanceService`,
 * pour la même raison — le plafond de 1 à 5 interventions/jour rend une
 * fenêtre plus courte structurellement pauvre en échantillon), et le nombre
 * d'utilisateurs qui ont coupé Laura (`laura_enabled = false`), qui vit dans
 * une table DIFFÉRENTE et ne peut donc pas se lire dans la même requête.
 *
 * Comme `LauraAcceptanceService` : agrégé sur TOUS les espaces, pas par
 * tenant — une décision de PRODUIT, qui vaut pour tout le monde, jamais par
 * client (le coût d'accès, lui, ne s'agrège jamais entre espaces ; ceci n'en
 * est pas un).
 */
const ANALYTICS_WINDOW_DAYS = 30
const MAX_ROWS = 20_000

@Injectable()
export class LauraAnalyticsService {
  constructor(
    @InjectRepository(LauraInterventionEntity)
    private readonly interventions: Repository<LauraInterventionEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferences: Repository<NotificationPreferenceEntity>,
  ) {}

  async summarize(now = new Date()): Promise<LauraAnalyticsSummary> {
    const since = new Date(now.getTime() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const [traces, disabledUserCount] = await Promise.all([
      this.interventions.find({
        // #2439.10 — une trace OUBLIÉE ne pèse dans aucune des huit métriques,
        // exactement comme elle ne pèse plus dans le taux d'acceptation par
        // surface ni dans ce qui fait taire Laura.
        where: { created_at: MoreThanOrEqual(since), archived_at: IsNull() },
        select: ['reaction', 'created_at'],
        take: MAX_ROWS,
      }),
      this.preferences.count({ where: { laura_enabled: false } }),
    ])

    return computeLauraAnalytics(
      traces.map(trace => ({ reaction: trace.reaction, created_at: trace.created_at.getTime() })),
      disabledUserCount,
      now.getTime(),
    )
  }
}
