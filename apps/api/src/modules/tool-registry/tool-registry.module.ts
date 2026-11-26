import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import { ConnectorCapabilityIncidentLogEntity } from '../../database/entities/connector-capability-incident-log.entity'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminDocsConnectionEntity } from '../../database/entities/admin-docs-connection.entity'
import { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { IntegrationEntity } from '../../database/entities/integration.entity'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import { LemlistConnectionEntity } from '../../database/entities/lemlist-connection.entity'
import { ToolLatencyObservationEntity } from '../../database/entities/tool-latency-observation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { AgendaModule } from '../agenda/agenda.module'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { CrmModule } from '../crm/crm.module'
import { GoogleModule } from '../google/google.module'
import { MicrosoftModule } from '../microsoft/microsoft.module'
import { NotionModule } from '../notion/notion.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AdminToolRegistryController } from './admin-tool-registry.controller'
import { CrmSyncCursorEntity } from '../../database/entities/crm-sync-cursor.entity'
import { ConnectorProbeService } from './connector-probe.service'
import { ConnectorIncidentOpsController } from './connector-incident-ops.controller'
import { ConnectorIncidentOpsService } from './connector-incident-ops.service'
import { ConnectorTestController } from './connector-test.controller'
import { CopilotSourceConnectionsController } from './copilot-source-connections.controller'
import { ToolRegistryController } from './tool-registry.controller'
import { ToolRegistryService } from './tool-registry.service'

/**
 * Unified Tool Registry — a READ-only aggregation over the three connection
 * silos (`integrations`, `crm_connections`, `oauth_consents`) plus a static
 * catalogue of modeled tools. It only *reads* those tables, so it neither owns
 * their schema nor their write paths: dropping this module removes the unified
 * `/tool-registry` view without affecting the CRM / Salesforce / integrations /
 * OAuth modules (CLAUDE rule #7). `WorkspaceModule` supplies the active-workspace
 * scoping used for CRM + dedicated OAuth rows; `IaClient` (global) reports the
 * IA-hosted data sources' configured status.
 *
 * Two read surfaces, deliberately separated:
 *   - {@link ToolRegistryController} — `/tool-registry`, JWT, l'appelant et lui
 *     seul ;
 *   - {@link AdminToolRegistryController} — `/internal/admin/tool-registry*`,
 *     secret interne, transverse aux espaces, pour le Dashboard Manager.
 */
@Module({
  imports: [
    WorkspaceModule,
    // Les cinq modules que « Tester » interroge. Composition de MODULES, pas
    // import de services : l'orchestration vit dans le contrôleur, et GA-07 ne
    // bouge pas d'un cran. Aucun de ces cinq n'importe le registre en retour —
    // vérifié : pas de cycle.
    GoogleModule,
    MicrosoftModule,
    NotionModule,
    CrmModule,
    AgendaModule,
    ConnectorScopeGapsModule,
    TypeOrmModule.forFeature([
      IntegrationEntity,
      CrmConnectionEntity,
      OAuthConsentEntity,
      GoogleConnectionEntity,
      NotionConnectionEntity,
      MicrosoftConnectionEntity,
      WorkspaceMemberEntity,
      AtsConnectionEntity,
      TelephonyConnectionEntity,
      LemlistConnectionEntity,
      AdminDocsConnectionEntity,
      ConnectorCapabilityProbeEntity,
      // #2445.12 (LOT écrivain 28/09, passe 2) — le journal des transitions,
      // DÉCLARÉ ici (GA-20) comme le probe ci-dessus.
      ConnectorCapabilityIncidentEntity,
      // #2445.12 (épopée #2766, lot SRC5 28/09 soir) — le journal append-only
      // des actions et communications d'un incident, DÉCLARÉ ici (GA-20).
      ConnectorCapabilityIncidentLogEntity,
      ToolLatencyObservationEntity,
      // CRM-SYNC-D.2 — lus pour dire « vérifié » quand une synchro réelle a abouti (GA-20).
      CrmSyncCursorEntity,
    ]),
  ],
  controllers: [
    ToolRegistryController,
    AdminToolRegistryController,
    ConnectorTestController,
    ConnectorIncidentOpsController,
    // #3904.3 — le pont de Laura vers la lecture unique des quatre sources.
    CopilotSourceConnectionsController,
  ],
  providers: [ToolRegistryService, ConnectorProbeService, ConnectorIncidentOpsService],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
