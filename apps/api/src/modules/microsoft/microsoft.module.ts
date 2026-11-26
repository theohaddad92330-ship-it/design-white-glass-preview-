import { Module } from '@nestjs/common'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { MailerModule } from '../mailer/mailer.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MicrosoftController } from './microsoft.controller'
import { MicrosoftService } from './microsoft.service'

/**
 * Microsoft 365 / Outlook OAuth integration (Microsoft Graph — Mail + Calendar).
 * Own `microsoft_connections` table + the CRM token crypto for at-rest
 * encryption. Imports MailerModule solely for the SuppressionService opt-out gate
 * on outbound mail (#394). Inert until MICROSOFT_* env vars are configured (rule #7).
 */
@Module({
  imports: [
    ConnectorScopeGapsModule,
    WorkspaceModule,
    MailerModule,
    TypeOrmModule.forFeature([MicrosoftConnectionEntity]),
  ],
  controllers: [MicrosoftController],
  providers: [MicrosoftService],
  exports: [MicrosoftService],
})
export class MicrosoftModule {}
