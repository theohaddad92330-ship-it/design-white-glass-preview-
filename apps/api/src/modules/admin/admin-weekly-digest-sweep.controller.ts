import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  AdminWeeklyDigestSweepService,
  type WeeklyDigestSweepAuditReport,
  type WeeklyDigestSweepReport,
} from './admin-weekly-digest-sweep.service'
import { SweepWeeklyDigestDto } from './dto/sweep-weekly-digest.dto'

/**
 * #balayage-weekly-digest — 15/09/2026, Louis (« un balayage avec simulation
 * et compte affiché AVANT d'écrire, même forme que le balayage de
 * régénération des contextes »). Voir `admin-weekly-digest-sweep.service.ts`
 * pour le fait et le critère.
 *
 * Consommé CÔTÉ SERVEUR par `dashboard-manager`, même porte que le reste de
 * `internal/admin` — cross-tenant par conception (`notification_preferences`
 * de TOUS les utilisateurs), donc `InternalSecretGuard` est la seule chose
 * entre cette route et toute la base. Il ne doit jamais être retiré.
 *
 * Deux routes, dans l'ordre du geste opérateur :
 *  1. `GET weekly-digest-sweep/audit` — compte, sans jamais écrire ;
 *  2. `POST weekly-digest-sweep` — refuse (409) si le compte a bougé depuis
 *     l'audit, ne touche que les lignes héritées.
 *
 * ⚠️ Ce contrôleur ne DÉCLENCHE rien tout seul : `sweep` répond à un appel
 * opérateur explicite, `confirmCount` en main. Lancer le balayage en
 * production reste un geste d'opérateur, pas un effet de ce déploiement.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminWeeklyDigestSweepController {
  constructor(private readonly weeklyDigestSweep: AdminWeeklyDigestSweepService) {}

  @Get('weekly-digest-sweep/audit')
  auditReport(): Promise<WeeklyDigestSweepAuditReport> {
    return this.weeklyDigestSweep.audit()
  }

  @Post('weekly-digest-sweep')
  sweep(@Body() dto: SweepWeeklyDigestDto): Promise<WeeklyDigestSweepReport> {
    return this.weeklyDigestSweep.sweep(dto.confirmCount)
  }
}
