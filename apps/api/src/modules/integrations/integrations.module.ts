import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IntegrationDeliveryEntity } from '../../database/entities/integration-delivery.entity'
import { IntegrationEntity } from '../../database/entities/integration.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AdminIntegrationsController } from './admin-integrations.controller'
import { IntegrationsController } from './integrations.controller'
import { INTEGRATION_DELIVERY_QUEUE } from './integrations.queue'
import { IntegrationsService } from './integrations.service'
import { IntegrationsDeliveryWorker } from './integrations.worker'

@Module({
  // WorkspaceModule supplies the WorkspacePermissionGuard (RBAC `integrations:manage`).
  imports: [
    TypeOrmModule.forFeature([IntegrationEntity, IntegrationDeliveryEntity, WorkspaceMemberEntity]),
    // Outbound deliveries flow through BullMQ (webhooks v2): journal + retries
    // (30s/5min/30min on transient failures) — see integrations.worker.ts.
    BullModule.registerQueue({
      name: INTEGRATION_DELIVERY_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800 },
      },
    }),
    WorkspaceModule,
  ],
  controllers: [IntegrationsController, AdminIntegrationsController],
  providers: [IntegrationsService, IntegrationsDeliveryWorker],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
