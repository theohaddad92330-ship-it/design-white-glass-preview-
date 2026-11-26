import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { FirstProofRecetteService, type FirstProofRecetteReport } from './first-proof-recette.service'

/**
 * #2076.13 — la recette produit de la « première preuve », pour le back-office
 * `dashboard-manager` (`/produit/premiere-preuve`).
 *
 * Même porte que les autres lectures opérateur : {@link InternalSecretGuard},
 * cross-tenant par nature. La réponse ne porte AUCUN identifiant d'espace ni
 * aucun texte libre (voir {@link FirstProofRecetteService}).
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalFirstProofRecetteController {
  constructor(private readonly recette: FirstProofRecetteService) {}

  @Get('first-proof-verdicts')
  getFirstProofVerdicts(@Query('days') days?: string): Promise<FirstProofRecetteReport> {
    const parsed = days === undefined ? undefined : Number.parseInt(days, 10)
    return this.recette.report(Number.isFinite(parsed) ? parsed : undefined, new Date())
  }
}
