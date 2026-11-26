import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminWorkspaceHealthService, type AdminWorkspaceHealthReport } from './admin-workspace-health.service'

/**
 * La santé de PRODUIT d'un espace (score interne §5.6, #2977), pour la vue
 * admin/pilotage — jamais une route utilisateur, jamais le score de
 * `/revenus/clients` (#1652, `AdminClientHealthController`, un autre score).
 *
 * ⚠️ `workspace-health` est un chemin LITTÉRAL sous `internal/admin`, comme
 * `client-health` avant lui : aucun contrôleur voisin ne déclare de paramètre
 * au premier segment, il ne peut donc pas être avalé par un `:id` voisin (le
 * défaut que la garde GA sur les routes littérales surveille ailleurs).
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminWorkspaceHealthController {
  constructor(private readonly workspaceHealth: AdminWorkspaceHealthService) {}

  @Get('workspace-health/:workspaceId')
  get(@Param('workspaceId', ParseUUIDPipe) workspaceId: string): Promise<AdminWorkspaceHealthReport> {
    return this.workspaceHealth.get(workspaceId)
  }
}
