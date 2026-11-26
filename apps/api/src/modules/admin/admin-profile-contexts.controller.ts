import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  AdminProfileContextsService,
  type ProbabilityAuditReport,
  type RegenerateReport,
} from './admin-profile-contexts.service'
import { RegenerateProfileContextsDto } from './dto/regenerate-profile-contexts.dto'

/**
 * #2231 — balayage de régénération des `profiles.profile_context` écrits
 * avant que le prompt du Profiler n'interdise la probabilité (13/09/2026,
 * `039ea2e8c`). Corriger un producteur ne corrige pas son stock.
 *
 * Consommé CÔTÉ SERVEUR par `dashboard-manager`, même porte que le reste de
 * `internal/admin` — cross-tenant par conception (`profiles` de TOUS les
 * utilisateurs), donc `InternalSecretGuard` est la seule chose entre cette
 * route et toute la base. Il ne doit jamais être retiré.
 *
 * Deux routes, dans l'ordre du geste opérateur :
 *  1. `GET probability-audit` — compte, sans jamais écrire ;
 *  2. `POST regenerate` — refuse (409) si le compte a bougé depuis l'audit,
 *     ne rejoue que les contextes détectés, via `triggerGeneration` et rien
 *     d'autre.
 *
 * ⚠️ Ce contrôleur ne DÉCLENCHE rien tout seul : `regenerate` répond à un
 * appel opérateur explicite, `confirmCount` en main. Lancer le balayage en
 * production reste un geste d'opérateur, pas un effet de ce déploiement.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminProfileContextsController {
  constructor(private readonly profileContexts: AdminProfileContextsService) {}

  @Get('profile-contexts/probability-audit')
  probabilityAudit(): Promise<ProbabilityAuditReport> {
    return this.profileContexts.audit()
  }

  @Post('profile-contexts/regenerate')
  regenerate(@Body() dto: RegenerateProfileContextsDto): Promise<RegenerateReport> {
    return this.profileContexts.regenerate(dto.confirmCount)
  }
}
