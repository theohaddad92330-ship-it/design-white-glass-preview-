import { Injectable } from '@nestjs/common'
import { correlationStorage, getCorrelationId, getCorrelationContext, CorrelationContext } from './correlation-id.store'

@Injectable()
export class CorrelationIdService {
  getCorrelationId(): string | undefined {
    return getCorrelationId()
  }

  getContext(): CorrelationContext | undefined {
    return getCorrelationContext()
  }

  /**
   * Run a function within a correlation context.
   * Used by BullMQ workers to restore the correlation ID from job data.
   */
  runWithContext<T>(context: CorrelationContext, fn: () => T): T {
    return correlationStorage.run(context, fn)
  }
}
