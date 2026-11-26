import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ConnectorScopeGapsService, type IncompleteConnectorRow } from './connector-scope-gaps.service'

/**
 * Les connexions incomplètes, pour le back-office. Transverse aux espaces : la garde du secret
 * interne est la seule chose entre cet endpoint et toute la base. Lecture seule, sans jeton.
 */
@Controller('internal/admin/scope-gaps')
@UseGuards(InternalSecretGuard)
export class AdminScopeGapsController {
  constructor(private readonly gaps: ConnectorScopeGapsService) {}

  @Get()
  async list(): Promise<{ connectors: IncompleteConnectorRow[] }> {
    return { connectors: await this.gaps.incompleteByConnector() }
  }
}
