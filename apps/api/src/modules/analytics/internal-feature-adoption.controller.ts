import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { FeatureAdoptionReport } from './feature-adoption-usage'
import { FeatureAdoptionUsageService } from './feature-adoption-usage.service'

/**
 * #1685 — l'usage RÉEL de chaque fonction gatée par l'offre, agrégé PAR
 * FONCTION à travers tous les espaces, pour le back-office `dashboard-manager`
 * (`/produit/adoption`).
 *
 * Même porte que le reste des KPI manager : {@link InternalSecretGuard},
 * cross-tenant par nature (l'opérateur voit tous les espaces), donc c'est la
 * SEULE chose qui protège la base entière derrière cette route. Elle ne doit
 * jamais être retirée.
 *
 * ⚠️ Contrôleur SÉPARÉ de `InternalTeamKpisController` plutôt qu'une route de
 * plus dedans — même raison que `InternalOnboardingFunnelController` (dont le
 * docblock nommait déjà #1685 parmi les lots parallèles à venir) : ce fichier
 * partagé porte déjà onze routes, et plusieurs lots de la série `/produit`
 * touchent `analytics/` EN PARALLÈLE. Un fichier neuf ne conflicte avec aucun
 * des autres.
 *
 * ⚠️ La réponse ne porte JAMAIS d'identifiant d'espace : voir le docblock de
 * `feature-adoption-usage.ts` — le service qui nourrit cette route ne reçoit
 * que des comptes déjà agrégés PAR PALIER.
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalFeatureAdoptionController {
  constructor(private readonly usage: FeatureAdoptionUsageService) {}

  @Get('feature-adoption')
  getFeatureAdoption(@Query('days') days?: string): Promise<FeatureAdoptionReport> {
    return this.usage.report(days === undefined ? undefined : Number.parseInt(days, 10))
  }
}
