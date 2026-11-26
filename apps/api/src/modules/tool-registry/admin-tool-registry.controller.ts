import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { AdminCatalogReport, AdminWorkspaceRegistry } from './tool-registry.admin'
import { ToolRegistryService } from './tool-registry.service'

/**
 * La moitié OPÉRATEUR du registre d'outils, pour le `dashboard-manager`.
 *
 * L'écran client (Réglages › Intégrations) ne montre que ce sur quoi
 * l'utilisateur peut agir : brancher, débrancher, tester. L'inventaire — ce que
 * chaque outil lit et écrit, ce qu'il coûte, ses limites de débit, ce que Bellum
 * en retient, et qui l'a branché chez quel client — est de l'observabilité et
 * vit ici.
 *
 * Même préfixe et même garde que {@link AdminOpsController} : `internal/admin`
 * derrière {@link InternalSecretGuard}. Le contenu est transverse aux espaces
 * par construction, donc la garde est la seule chose entre cet endpoint et toute
 * la base — elle ne doit jamais sauter.
 *
 * Lecture seule et sans secret : ni URL de webhook, ni jeton OAuth ne traversent
 * ces réponses.
 */
@Controller('internal/admin/tool-registry')
@UseGuards(InternalSecretGuard)
export class AdminToolRegistryController {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  /** Le catalogue complet + l'état de configuration de CE serveur. */
  @Get()
  catalog(): Promise<AdminCatalogReport> {
    return this.toolRegistry.catalog()
  }

  /** L'état réel du registre pour un espace de travail donné. */
  @Get('workspaces/:workspaceId')
  workspaceRegistry(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string): Promise<AdminWorkspaceRegistry> {
    return this.toolRegistry.registryForWorkspace(workspaceId)
  }
}
