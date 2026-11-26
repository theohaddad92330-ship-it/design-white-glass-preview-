import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { LauraUnroutedIntentsService, type LauraUnroutedIntentsReport } from './laura-unrouted-intents.service'

/**
 * #1949.23 — la lecture AGRÉGÉE des demandes que Laura n'a pas su router, pour
 * le back-office `dashboard-manager` (écran Produit › Laura — non compris).
 *
 * Même porte que les autres lectures produit : {@link InternalSecretGuard},
 * cross-tenant par nature. La réponse ne porte AUCUN hash, aucun identifiant, et
 * aucun texte sous le plancher d'occurrences distinctes — le service l'applique
 * à la LECTURE (GA-267), ce contrôleur n'a rien à filtrer.
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalLauraUnroutedIntentsController {
  constructor(private readonly intents: LauraUnroutedIntentsService) {}

  @Get('laura-unrouted-intents')
  getReport(@Query('days') days?: string): Promise<LauraUnroutedIntentsReport> {
    return this.intents.report(parseDays(days))
  }
}

/** `undefined` plutôt qu'un nombre inventé : le service porte SA fenêtre par défaut. */
function parseDays(days: string | undefined): number | undefined {
  if (days === undefined) return undefined
  const parsed = Number.parseInt(days, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
