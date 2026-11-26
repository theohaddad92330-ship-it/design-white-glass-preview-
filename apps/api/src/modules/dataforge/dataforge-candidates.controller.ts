import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { OrionAccountsService, type OrionAccountStatusView } from './orion-accounts.service'

/**
 * #2805 (#2291.3) — le SEUL point d'entrée qui rend DataForge/ORION
 * atteignable comme SOURCE DE CANDIDATS, jamais `InternalDataforgeController`
 * (back-office UNIQUEMENT — voir sa docstring : « un compte cible atteint le
 * produit… par un service dédié, jamais par ce contrôleur »). Interne,
 * gardé comme lui (`InternalSecretGuard`) : l'appelant visé est Découvrir
 * (`apps/ia`, `/discover/registry`), pas un navigateur.
 *
 * Un compte déjà au portefeuille de l'espace se signale par
 * `excludeSirenSiret` — jamais deviné ici, ce contrôleur ne connaît aucun
 * espace ni portefeuille.
 */
@Controller('internal/dataforge/candidates')
@UseGuards(InternalSecretGuard)
export class DataforgeCandidatesController {
  constructor(private readonly orionAccountsService: OrionAccountsService) {}

  @Get()
  search(
    @Query('sector') sector?: string,
    @Query('minAccountPotentialScore') minAccountPotentialScore?: string,
    @Query('excludeSirenSiret') excludeSirenSiret?: string | string[],
    @Query('limit') limit?: string,
  ): Promise<OrionAccountStatusView[]> {
    const minScore = minAccountPotentialScore === undefined ? NaN : Number(minAccountPotentialScore)
    const excludeSirenSirets =
      excludeSirenSiret === undefined
        ? undefined
        : Array.isArray(excludeSirenSiret)
          ? excludeSirenSiret
          : [excludeSirenSiret]
    const parsedLimit = limit === undefined ? NaN : Number(limit)

    return this.orionAccountsService.searchCandidates({
      sector,
      minAccountPotentialScore: Number.isFinite(minScore) ? minScore : undefined,
      excludeSirenSirets,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    })
  }
}
