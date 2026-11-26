import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { UnrecoverableError, type Job } from 'bullmq'
import { Repository } from 'typeorm'
import {
  IntegrationDeliveryEntity,
  type IntegrationDeliveryStatus,
} from '../../database/entities/integration-delivery.entity'
import { IntegrationEntity } from '../../database/entities/integration.entity'
import { decryptToken } from '../crm/crm-token.crypto'
import { PROVIDER_RULES } from './integration-providers'
import { deliverToEndpoint, type WebhookEvent } from './integrations.outbound'
import {
  deliveryBackoffMs,
  INTEGRATION_DELIVERY_QUEUE,
  sanitizeDeliveryError,
  type DeliveryJobData,
} from './integrations.queue'
import { Correlated } from '../../correlation-id/background-correlation'

/** Transient statuses worth retrying: 5xx (provider hiccup) and 429 (rate
 *  limit). Every other 4xx is an invalid/revoked webhook — a config error a
 *  retry cannot fix, so it fails immediately (no retry). */
export function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 || status === 429
}

/**
 * Processes one outbound integration delivery per job (webhooks v2). Every
 * attempt re-reads the ENCRYPTED row (the URL never sits in Redis), re-runs
 * the anti-SSRF guard inside `deliverToEndpoint` → `postJson`, and journals
 * the outcome into `integration_deliveries`:
 *
 *   - 2xx            → `success`, done.
 *   - other 4xx      → `failed` immediately (UnrecoverableError, no retry).
 *   - 5xx / 429 /
 *     network/timeout → `pending` + retry (30s / 5min / 30min), `failed` once
 *                       the 4th (last) attempt is exhausted.
 *
 * Journal rows NEVER contain the target URL nor the event payload — errors go
 * through `sanitizeDeliveryError` (URL-scrubbed + truncated).
 */
@Processor(INTEGRATION_DELIVERY_QUEUE, {
  // BullMQ only ships `exponential`/`fixed`: register the fixed 30s/5min/30min
  // ladder under the `type` used by DELIVERY_JOB_OPTIONS.
  settings: {
    backoffStrategy: (attemptsMade: number, type?: string) => {
      if (type === 'integration-backoff') return deliveryBackoffMs(attemptsMade)
      return 0
    },
  },
})
@Injectable()
export class IntegrationsDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(IntegrationsDeliveryWorker.name)

  constructor(
    @InjectRepository(IntegrationEntity)
    private readonly integrations: Repository<IntegrationEntity>,
    @InjectRepository(IntegrationDeliveryEntity)
    private readonly deliveries: Repository<IntegrationDeliveryEntity>,
  ) {
    super()
  }

  @Correlated('worker:integrations')
  async process(job: Job<DeliveryJobData>): Promise<void> {
    const { deliveryId, integrationId, event } = job.data
    // BullMQ v5: `attemptsMade` counts FAILED attempts — 0 while processing the
    // first attempt — so the human attempt number is +1.
    const attempt = job.attemptsMade + 1
    const maxAttempts = job.opts.attempts ?? 1

    const row = await this.integrations.findOne({ where: { id: integrationId } })
    if (!row) {
      // Disconnected while queued → terminal, nothing to deliver to (and no URL
      // to validate). Not an error worth a retry.
      await this.journal(deliveryId, { status: 'failed', attempt, error: 'Integration disconnected before delivery' })
      return
    }

    let url: string
    try {
      url = this.readUrl(row)
    } catch (error) {
      // Undecryptable/empty config = invalid config → no retry.
      await this.journal(deliveryId, { status: 'failed', attempt, error: sanitizeDeliveryError(error) })
      throw new UnrecoverableError('Integration config unreadable')
    }

    const rule = PROVIDER_RULES[row.provider]
    let res: Response
    try {
      // `deliverToEndpoint` → `postJson` re-runs `assertSafeOutboundUrl` on
      // EVERY attempt: a retry can never bypass the anti-SSRF guard. A guard
      // rejection lands here and is treated as terminal below via 4xx-less
      // classification: guard errors are config errors, but they raise before
      // any HTTP status exists — so classify by error origin instead.
      res = await deliverToEndpoint(url, rule.delivery, {
        text: event.text,
        envelope: this.envelope(event),
      })
    } catch (error) {
      if (isSsrfGuardError(error)) {
        // The pinned/resolved target is not allowed — config error, no retry.
        await this.journal(deliveryId, { status: 'failed', attempt, error: sanitizeDeliveryError(error) })
        throw new UnrecoverableError('Delivery target rejected by SSRF guard')
      }
      // Network / DNS / timeout — transient, retry.
      await this.journal(deliveryId, {
        status: attempt >= maxAttempts ? 'failed' : 'pending',
        attempt,
        error: sanitizeDeliveryError(error),
      })
      throw new Error(sanitizeDeliveryError(error))
    }

    if (res.ok) {
      await this.journal(deliveryId, { status: 'success', attempt, http_status: res.status, error: null })
      // Real delivery ⇒ real usage: feeds the Tool Registry's `last_sync`
      // (Tool Registry v2). Best-effort — a stamp blip must not fail delivery.
      await this.touchLastUsed(row)
      return
    }

    if (isRetryableHttpStatus(res.status)) {
      await this.journal(deliveryId, {
        status: attempt >= maxAttempts ? 'failed' : 'pending',
        attempt,
        http_status: res.status,
        error: `HTTP ${res.status}`,
      })
      throw new Error(`Delivery failed with HTTP ${res.status}`)
    }

    // Other 4xx: invalid/revoked webhook — retrying cannot fix a config error.
    await this.journal(deliveryId, { status: 'failed', attempt, http_status: res.status, error: `HTTP ${res.status}` })
    throw new UnrecoverableError(`Delivery rejected with HTTP ${res.status}`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DeliveryJobData> | undefined, err: Error): void {
    // The journal row already carries the sanitized detail; this is ops-side
    // visibility only. Never log the URL or the payload.
    this.logger.warn('Integration delivery attempt failed', {
      jobId: job?.id,
      deliveryId: job?.data?.deliveryId,
      attemptsMade: job?.attemptsMade,
      unrecoverable: err?.name === 'UnrecoverableError',
      message: sanitizeDeliveryError(err),
    })
  }

  /** Update the journal row; never throws (a journal miss must not break delivery). */
  private async journal(
    deliveryId: string,
    patch: Partial<Pick<IntegrationDeliveryEntity, 'http_status' | 'attempt' | 'error'>> & {
      status: IntegrationDeliveryStatus
    },
  ): Promise<void> {
    try {
      await this.deliveries.update({ id: deliveryId }, patch)
    } catch (error) {
      this.logger.warn('Failed to journal integration delivery', { deliveryId, error })
    }
  }

  private readUrl(row: IntegrationEntity): string {
    const parsed = JSON.parse(decryptToken(row.config_enc)) as { url?: string }
    if (!parsed?.url) throw new Error('Integration config is empty')
    return parsed.url
  }

  /** Stamp the integration's last REAL use after a successful delivery (Tool
   *  Registry v2 `last_sync`). Best-effort — never throws. */
  private async touchLastUsed(row: IntegrationEntity): Promise<void> {
    try {
      await this.integrations.update({ id: row.id }, { last_used_at: new Date() })
    } catch (error) {
      this.logger.warn('Failed to stamp integration last_used_at', { integrationId: row.id, error })
    }
  }

  private envelope(event: DeliveryJobData['event']): WebhookEvent {
    return { type: event.type, sentAt: new Date().toISOString(), data: event.data }
  }
}

/** The ssrf-guard throws plain Errors with fixed French messages — match them
 *  to classify "blocked target" as a non-retryable config error. */
function isSsrfGuardError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return ['Cible interne interdite.', 'URL invalide.', 'URL https requise.'].includes(error.message)
}
