import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  ConnectorIncidentOpsService,
  type ConnectorIncidentImpact,
  type ConnectorIncidentLogView,
} from './connector-incident-ops.service'
import { ConnectorIncidentActionDto, ConnectorIncidentCommunicationDto } from './dto/connector-incident-log.dto'

/**
 * #2445.12 (épopée #2766, lot SRC5 28/09 soir) — l'IMPACT, les ACTIONS et la
 * COMMUNICATION d'un incident, pour la console d'opérations (Dashboard
 * Manager). Même préfixe et même garde que {@link AdminOpsController} :
 * `internal/admin`, {@link InternalSecretGuard} — cross-tenant par
 * construction, la garde est la seule chose entre cet endpoint et toute la
 * base, elle ne doit jamais sauter.
 *
 * L'incident est identifié par la transition `degraded` qui l'a ouvert
 * (`connector_capability_incidents.id`, déjà rendu par
 * `OperatorHealthService.incidentTimeline`).
 */
@Controller('internal/admin/incidents')
@UseGuards(InternalSecretGuard)
export class ConnectorIncidentOpsController {
  constructor(private readonly incidentOps: ConnectorIncidentOpsService) {}

  @Get(':incidentId/impact')
  impact(@Param('incidentId', ParseUUIDPipe) incidentId: string): Promise<ConnectorIncidentImpact> {
    return this.incidentOps.impactOf(incidentId)
  }

  @Get(':incidentId/logs')
  logs(@Param('incidentId', ParseUUIDPipe) incidentId: string): Promise<ConnectorIncidentLogView[]> {
    return this.incidentOps.listLogs(incidentId)
  }

  @Post(':incidentId/actions')
  logAction(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() body: ConnectorIncidentActionDto,
  ): Promise<ConnectorIncidentLogView> {
    return this.incidentOps.logAction(incidentId, body.note, body.actor ?? null)
  }

  @Post(':incidentId/communications')
  logCommunication(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() body: ConnectorIncidentCommunicationDto,
  ): Promise<ConnectorIncidentLogView> {
    return this.incidentOps.logCommunication(incidentId, body.note, body.workspaceId ?? null, body.actor ?? null)
  }
}
