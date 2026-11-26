import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { RapportEntonnoir } from './onboarding-funnel'
import { OnboardingFunnelService } from './onboarding-funnel.service'

/**
 * #1686 — l'entonnoir d'onboarding par COHORTE MENSUELLE D'ESPACES, pour le
 * back-office `dashboard-manager`.
 *
 * Même porte que le reste des KPI manager : {@link InternalSecretGuard},
 * cross-tenant par nature (l'opérateur voit tous les espaces), donc c'est la
 * SEULE chose qui protège la base entière derrière cette route. Elle ne doit
 * jamais être retirée.
 *
 * ⚠️ Contrôleur SÉPARÉ de `InternalTeamKpisController` plutôt qu'une route de
 * plus dedans : plusieurs lots de la série `/produit` (#1683, #1685, #1687,
 * #1688) touchent `analytics/` EN PARALLÈLE, et ce fichier partagé porte déjà
 * neuf routes. Un fichier neuf ne CONFLICTE avec aucun des autres lots.
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalOnboardingFunnelController {
  constructor(private readonly funnel: OnboardingFunnelService) {}

  /**
   * L'horloge est passée par le contrôleur, jamais lue par le service : voir
   * `onboarding-funnel.service.ts`.
   */
  @Get('onboarding-funnel')
  getOnboardingFunnel(): Promise<RapportEntonnoir> {
    return this.funnel.entonnoir(new Date())
  }
}
