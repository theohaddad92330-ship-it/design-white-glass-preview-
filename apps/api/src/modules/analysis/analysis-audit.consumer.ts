import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { ALL_STREAMS, type DomainEvent, type EventBus } from '@bellum/events'
import { hostname } from 'node:os'
import { EVENT_BUS } from '../outbox/event-bus.token'

/**
 * Subscribes to every domain stream and writes a structured log line per
 * event. Acts as the canonical "did the event get through?" sink during
 * the EventBus rollout — Sentry breadcrumbs + Grafana log queries can pick
 * up `tags.service=event_bus` to verify end-to-end delivery.
 *
 * Idempotent: handler does no DB writes, so at-least-once redelivery is
 * harmless. A real consumer (analytics, audit-table writer) would dedupe
 * on `eventId` itself.
 */
@Injectable()
export class AnalysisAuditConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisAuditConsumer.name)
  private readonly controller = new AbortController()
  private subscribePromise: Promise<void> | null = null

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  onApplicationBootstrap(): void {
    // Don't await — the subscribe loop runs forever. We keep the promise
    // so we can wait on it in onModuleDestroy and surface the final
    // resolution on shutdown.
    this.subscribePromise = this.bus
      .subscribe({
        streams: ALL_STREAMS,
        consumerGroup: 'analysis-audit',
        consumerName: `${hostname()}:${process.pid}`,
        handler: this.handle,
        signal: this.controller.signal,
        logger: {
          warn: (msg, meta) => this.logger.warn(msg, meta),
          error: (msg, meta) => this.logger.error(msg, meta),
        },
      })
      .catch(err => {
        this.logger.error('Audit consumer subscribe loop crashed', { error: err })
      })
  }

  async onModuleDestroy(): Promise<void> {
    this.controller.abort()
    if (this.subscribePromise) {
      await this.subscribePromise.catch(() => undefined)
    }
  }

  private handle = async (event: DomainEvent, redisId: string): Promise<void> => {
    this.logger.log('domain event', {
      tags: {
        service: 'event_bus',
        event_type: event.type,
        ...(event.correlationId ? { correlation_id: event.correlationId } : {}),
      },
      contexts: {
        event: { eventId: event.eventId, redisId, occurredAt: event.occurredAt },
      },
    })
  }
}
