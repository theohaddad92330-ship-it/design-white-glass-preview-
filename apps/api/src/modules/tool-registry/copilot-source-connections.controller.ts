import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { salesSourceConnections } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CopilotSourceConnectionsDto } from './dto/copilot-source-connections.dto'
import { ToolRegistryService } from './tool-registry.service'

/**
 * #3904.3 — « qu'est-ce que Laura lit, et jusqu'à quand ? ». L'état de
 * connexion et la dernière synchro des quatre sources commerciales (CRM,
 * téléphonie, agenda, mail), relus du Tool Registry de l'appelant
 * (`ToolRegistryService.list`) et regroupés par `salesSourceConnections` — la
 * MÊME fonction que l'écran (centre d'intégrations) applique à
 * `GET /tool-registry`. Aucun second calcul (GA-26).
 *
 * Contrôleur à part, dans le module qui possède le registre : le pont du
 * copilote n'a pas à importer ce module pour une lecture (craft rule 7). Ce
 * qui sort : la source, son état, une date — jamais le nom de l'éditeur
 * (GA-69 : sur le chemin du copilote, une clé de JSON est du texte affiché).
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotSourceConnectionsController {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  @Post('sources/connections')
  async sources(@Body() dto: CopilotSourceConnectionsDto) {
    return { sources: salesSourceConnections(await this.toolRegistry.list(dto.userId)) }
  }
}
