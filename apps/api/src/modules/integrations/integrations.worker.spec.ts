import type { Job } from 'bullmq'
import type { Repository } from 'typeorm'
import type { IntegrationDeliveryEntity } from '../../database/entities/integration-delivery.entity'
import type { IntegrationEntity } from '../../database/entities/integration.entity'
import { encryptToken } from '../crm/crm-token.crypto'
import {
  DELIVERY_BACKOFF_MS,
  DELIVERY_JOB_OPTIONS,
  DELIVERY_MAX_ATTEMPTS,
  deliveryBackoffMs,
  sanitizeDeliveryError,
  type DeliveryJobData,
} from './integrations.queue'
import { IntegrationsDeliveryWorker, isRetryableHttpStatus } from './integrations.worker'

// The SSRF guard resolves DNS for non-IP hosts before every POST. Pin it to a
// public address so the retry-policy tests are deterministic (no live DNS);
// the "internal target" test uses an IP literal, which never hits `lookup`.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

const USER = '11111111-1111-1111-1111-111111111111'
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXXsecretXXXX'

function makeIntegrationsRepo(rows: Partial<IntegrationEntity>[]) {
  return {
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find(r => r.id === where.id) ?? null),
    // `touchLastUsed` (Tool Registry v2) stamps `last_used_at` on a successful
    // delivery; mutate the in-memory rows so the tests can assert it.
    update: jest.fn(async (where: { id: string }, patch: Partial<IntegrationEntity>) => {
      const row = rows.find(r => r.id === where.id)
      if (row) Object.assign(row, patch)
    }),
  } as unknown as Repository<IntegrationEntity>
}

function makeDeliveriesRepo() {
  const updates: Array<{ where: Record<string, unknown>; patch: Record<string, unknown> }> = []
  const repo = {
    update: jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      updates.push({ where, patch })
    }),
  } as unknown as Repository<IntegrationDeliveryEntity> & { update: jest.Mock }
  return { repo, updates }
}

function makeRow(over: Partial<IntegrationEntity> = {}): Partial<IntegrationEntity> {
  return {
    id: 'int-1',
    user_id: USER,
    provider: 'slack',
    config_enc: encryptToken(JSON.stringify({ url: SLACK_URL })),
    events: null,
    ...over,
  }
}

function makeJob(over: { attemptsMade?: number; attempts?: number; event?: DeliveryJobData['event'] } = {}) {
  return {
    id: 'job-1',
    data: {
      deliveryId: 'del-1',
      integrationId: 'int-1',
      userId: USER,
      event: over.event ?? { type: 'analysis.completed', text: 'Dossier prêt', data: { accountId: 'a1' } },
    },
    attemptsMade: over.attemptsMade ?? 0,
    opts: { attempts: over.attempts ?? DELIVERY_MAX_ATTEMPTS },
  } as unknown as Job<DeliveryJobData>
}

describe('retry policy constants', () => {
  it('ships 1 initial attempt + 3 retries with the 30s/5min/30min ladder', () => {
    expect(DELIVERY_MAX_ATTEMPTS).toBe(4)
    expect(DELIVERY_JOB_OPTIONS.attempts).toBe(4)
    expect(DELIVERY_BACKOFF_MS).toEqual([30_000, 300_000, 1_800_000])
    expect(deliveryBackoffMs(1)).toBe(30_000)
    expect(deliveryBackoffMs(2)).toBe(300_000)
    expect(deliveryBackoffMs(3)).toBe(1_800_000)
    // Clamped: an out-of-range attempt reuses the last rung, never NaN/undefined.
    expect(deliveryBackoffMs(0)).toBe(30_000)
    expect(deliveryBackoffMs(9)).toBe(1_800_000)
  })

  it('classifies 5xx and 429 as retryable, every other 4xx as terminal', () => {
    expect(isRetryableHttpStatus(500)).toBe(true)
    expect(isRetryableHttpStatus(502)).toBe(true)
    expect(isRetryableHttpStatus(429)).toBe(true)
    expect(isRetryableHttpStatus(400)).toBe(false)
    expect(isRetryableHttpStatus(401)).toBe(false)
    expect(isRetryableHttpStatus(404)).toBe(false)
    expect(isRetryableHttpStatus(410)).toBe(false)
  })
})

describe('sanitizeDeliveryError', () => {
  it('scrubs URLs (they embed webhook secrets) and truncates', () => {
    const err = new Error(`request to ${SLACK_URL} failed, reason: socket hang up`)
    const safe = sanitizeDeliveryError(err)
    expect(safe).not.toContain('hooks.slack.com')
    expect(safe).not.toContain('secret')
    expect(safe).toContain('[url]')
    expect(sanitizeDeliveryError(new Error('x'.repeat(1000))).length).toBeLessThanOrEqual(300)
  })

  it('keeps the nested fetch cause (Node wraps network errors as "fetch failed")', () => {
    const err = new Error('fetch failed')
    ;(err as Error & { cause?: Error }).cause = new Error('getaddrinfo ENOTFOUND example.com')
    expect(sanitizeDeliveryError(err)).toContain('ENOTFOUND')
  })
})

describe('IntegrationsDeliveryWorker', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  function makeWorker(rows: Partial<IntegrationEntity>[] = [makeRow()]) {
    const { repo, updates } = makeDeliveriesRepo()
    const worker = new IntegrationsDeliveryWorker(makeIntegrationsRepo(rows), repo)
    return { worker, updates, rows }
  }

  it('journals success (status, HTTP code, attempt) on a 2xx delivery', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)
    const { worker, updates } = makeWorker()

    await expect(worker.process(makeJob())).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].where).toEqual({ id: 'del-1' })
    expect(updates[0].patch).toMatchObject({ status: 'success', http_status: 200, attempt: 1, error: null })
  })

  it('stamps the integration last_used_at on a 2xx delivery (Tool Registry v2 last_sync)', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)
    const { worker, rows } = makeWorker()
    expect(rows[0].last_used_at ?? null).toBeNull()

    await worker.process(makeJob())

    expect(rows[0].last_used_at).toBeInstanceOf(Date)
  })

  it('does NOT stamp last_used_at when the delivery failed (no invented usage)', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 500 } as never)
    const { worker, rows } = makeWorker()

    await worker.process(makeJob()).catch(() => undefined)

    expect(rows[0].last_used_at ?? null).toBeNull()
  })

  it('4xx (invalid config) → journals failed and throws UnrecoverableError: NO retry', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 404 } as never)
    const { worker, updates } = makeWorker()

    await expect(worker.process(makeJob())).rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(updates[0].patch).toMatchObject({ status: 'failed', http_status: 404, attempt: 1 })
  })

  it('5xx → journals pending and throws a plain Error: BullMQ retries', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 503 } as never)
    const { worker, updates } = makeWorker()

    const rejection = await worker.process(makeJob()).catch((e: Error) => e)
    expect(rejection).toBeInstanceOf(Error)
    expect((rejection as Error).name).not.toBe('UnrecoverableError')

    expect(updates[0].patch).toMatchObject({ status: 'pending', http_status: 503, attempt: 1 })
  })

  it('429 (rate limit) is transient → retried like a 5xx', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 429 } as never)
    const { worker, updates } = makeWorker()

    const rejection = await worker.process(makeJob()).catch((e: Error) => e)
    expect((rejection as Error).name).not.toBe('UnrecoverableError')
    expect(updates[0].patch).toMatchObject({ status: 'pending', http_status: 429 })
  })

  it('5xx on the LAST attempt → journals failed (retries exhausted)', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 500 } as never)
    const { worker, updates } = makeWorker()

    // BullMQ v5: attemptsMade counts failed attempts → 3 means this is attempt 4/4.
    await expect(worker.process(makeJob({ attemptsMade: 3 }))).rejects.toBeInstanceOf(Error)

    expect(updates[0].patch).toMatchObject({ status: 'failed', http_status: 500, attempt: 4 })
  })

  it('network error → journals pending with a sanitized (URL-scrubbed) error and retries', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockRejectedValue(new Error(`request to ${SLACK_URL} failed, socket hang up`) as never)
    const { worker, updates } = makeWorker()

    const rejection = await worker.process(makeJob()).catch((e: Error) => e)
    expect((rejection as Error).name).not.toBe('UnrecoverableError')

    const patch = updates[0].patch as { status: string; error: string }
    expect(patch.status).toBe('pending')
    expect(patch.error).toContain('[url]')
    expect(patch.error).not.toContain('hooks.slack.com')
    expect(patch.error).not.toContain('secret')
  })

  it('SSRF guard still blocks an internal target on delivery — terminal, no retry, fetch never called', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)
    const internal = makeRow({
      provider: 'webhook',
      config_enc: encryptToken(JSON.stringify({ url: 'https://10.0.0.8/internal-hook' })),
    })
    const { worker, updates } = makeWorker([internal])

    await expect(worker.process(makeJob())).rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(fetchSpy).not.toHaveBeenCalled()
    const patch = updates[0].patch as { status: string; error: string }
    expect(patch.status).toBe('failed')
    // The journal never leaks the target URL.
    expect(patch.error).not.toContain('10.0.0.8')
  })

  it('integration disconnected while queued → journals failed, no throw, no network call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)
    const { worker, updates } = makeWorker([])

    await expect(worker.process(makeJob())).resolves.toBeUndefined()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(updates[0].patch).toMatchObject({ status: 'failed' })
  })

  it('shapes the body per provider on delivery (Slack chat = `text` key, generic webhook = event envelope)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)
    const { worker } = makeWorker()
    await worker.process(makeJob())
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Dossier prêt' })

    const generic = makeRow({
      provider: 'webhook',
      config_enc: encryptToken(JSON.stringify({ url: 'https://example.com/hooks/bellum' })),
    })
    const { worker: webhookWorker } = makeWorker([generic])
    await webhookWorker.process(makeJob())
    const [, webhookInit] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(webhookInit.body))
    expect(body).toMatchObject({ type: 'analysis.completed', data: { accountId: 'a1' } })
    expect(body.sentAt).toEqual(expect.any(String))
  })
})
