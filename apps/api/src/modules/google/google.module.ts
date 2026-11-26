import { Module } from '@nestjs/common'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { MailerModule } from '../mailer/mailer.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { GoogleController } from './google.controller'
import { GoogleService } from './google.service'

/**
 * Google Workspace integration — env-gated, fully self-contained (repo rule #7:
 * removing it breaks nothing else). Reuses the CRM token crypto, the workspace
 * scope, the global `IaClient` (RAG ingest) and the mailer's SuppressionService
 * (Gmail opt-out guardrail); owns only the `google_connections` table.
 */
@Module({
  imports: [
    ConnectorScopeGapsModule,
    WorkspaceModule,
    MailerModule,
    TypeOrmModule.forFeature([GoogleConnectionEntity]),
  ],
  controllers: [GoogleController],
  providers: [GoogleService],
  exports: [GoogleService],
})
export class GoogleModule {}
