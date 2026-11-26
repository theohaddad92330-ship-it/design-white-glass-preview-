import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminClientHealthService, type AdminClientHealthReport } from './admin-client-health.service'

/**
 * La santé des espaces clients, pour `/revenus/clients` du back-office (#1652).
 *
 * Consommé CÔTÉ SERVEUR par la console `dashboard-manager`, qui porte le secret
 * interne — même porte que le reste de `internal/admin`. La route est en
 * LECTURE SEULE : les quatre actions de la ligne (incarner, suspendre, changer
 * d'offre, créditer) existaient déjà et gardent leurs propres routes, leur
 * propre capacité et leur propre journal. Ce contrôleur n'en duplique aucune.
 *
 * ⚠️ `client-health` est un chemin LITTÉRAL, et aucun contrôleur de
 * `internal/admin` ne déclare de paramètre au premier segment — il ne peut donc
 * pas être avalé par un `:id` voisin (le défaut que GA garde ailleurs).
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminClientHealthController {
  constructor(private readonly clientHealth: AdminClientHealthService) {}

  /**
   * ⚠️ L'HORLOGE EST LUE ICI, ET NULLE PART AILLEURS. Le service la reçoit, le
   * calcul la reçoit : c'est ce qui rend les deux testables sans figer le temps
   * et sans qu'une spec verte à Paris tombe dans une CI en UTC.
   */
  @Get('client-health')
  list(@Query('search') search?: string): Promise<AdminClientHealthReport> {
    return this.clientHealth.list({ search: search?.trim() || undefined, now: new Date() })
  }
}
