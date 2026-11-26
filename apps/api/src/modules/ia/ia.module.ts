import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { IaClient } from './ia.client'

/**
 * Global module that exposes `IaClient` — the single entry point for FastAPI calls.
 * Marked `@Global()` so consumers (AnalysisWorker, ContactsService, etc.) don't each need
 * to add `IaModule` to their imports array.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [IaClient],
  exports: [IaClient],
})
export class IaModule {}
