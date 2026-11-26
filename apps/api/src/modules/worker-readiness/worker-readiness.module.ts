import { Global, Module } from '@nestjs/common'
import { WorkerReadinessRegistry } from './worker-readiness.registry'

/**
 * `@Global` so the BullMQ worker (AnalysisModule) and the readiness gate
 * (HealthModule) share ONE registry instance without either importing the other
 * — both modules stay independent (repo rule #7). Registered once in AppModule.
 */
@Global()
@Module({
  providers: [WorkerReadinessRegistry],
  exports: [WorkerReadinessRegistry],
})
export class WorkerReadinessModule {}
