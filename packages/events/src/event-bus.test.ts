import { describe, expect, it, vi } from 'vitest'
import type { Redis } from 'ioredis'
import { RedisStreamsEventBus } from './event-bus.js'
import { STREAM_BY_TYPE, type DomainEvent } from './schemas.js'

// ── Tiny in-memory Redis mock — only the surface we need for the bus ────────

type StreamEntry = { id: string; fields: string[] }

class FakeRedis {
  private streams = new Map<string, StreamEntry[]>()
  private groups = new Map<string, Map<string, Set<string>>>() // stream → group → set(id) seen
  private nextSeq = 0

  xadd = vi.fn(async (stream: string, ..._rest: string[]): Promise<string> => {
    // Strip MAXLEN args, keep field/value pairs after '*'
    const argsAfterMaxlen = _rest.slice(_rest.indexOf('*') + 1)
    const id = `${Date.now()}-${this.nextSeq++}`
    const entry: StreamEntry = { id, fields: argsAfterMaxlen }
    const list = this.streams.get(stream) ?? []
    list.push(entry)
    this.streams.set(stream, list)
    return id
  }) as unknown as Redis['xadd']

  xgroup = vi.fn(
    async (_verb: 'CREATE', stream: string, group: string, _start: string, _mkstream: 'MKSTREAM'): Promise<string> => {
      const groupsForStream = this.groups.get(stream) ?? new Map()
      if (groupsForStream.has(group)) {
        throw new Error('BUSYGROUP Consumer Group name already exists')
      }
      groupsForStream.set(group, new Set())
      this.groups.set(stream, groupsForStream)
      return 'OK'
    },
  ) as unknown as Redis['xgroup']

  xreadgroup = vi.fn(
    async (
      _group: 'GROUP',
      groupName: string,
      _consumer: string,
      _count: 'COUNT',
      _batch: string,
      _block: 'BLOCK',
      _ms: string,
      _streams: 'STREAMS',
      ...rest: string[]
    ): Promise<[string, [string, string[]][]][] | null> => {
      const half = rest.length / 2
      const streamNames = rest.slice(0, half)
      const result: [string, [string, string[]][]][] = []
      for (const stream of streamNames) {
        const seen = this.groups.get(stream)?.get(groupName) ?? new Set<string>()
        const entries = (this.streams.get(stream) ?? []).filter(e => !seen.has(e.id))
        if (entries.length === 0) continue
        for (const e of entries) seen.add(e.id)
        result.push([stream, entries.map(e => [e.id, e.fields])])
      }
      return result.length > 0 ? result : null
    },
  ) as unknown as Redis['xreadgroup']

  xack = vi.fn(async (_stream: string, _group: string, _id: string) => 1) as unknown as Redis['xack']

  asRedis(): Redis {
    return this as unknown as Redis
  }
}

function makeAnalysisStarted(): DomainEvent {
  return {
    type: 'analysis.started',
    eventId: '00000000-0000-0000-0000-000000000001',
    occurredAt: new Date().toISOString(),
    correlationId: 'cid',
    jobId: 'job-1',
    accountId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    companyName: 'SNCF',
  }
}

describe('RedisStreamsEventBus.publish', () => {
  it('writes a validated payload to the per-type stream and returns the redis id', async () => {
    const fake = new FakeRedis()
    const bus = new RedisStreamsEventBus(fake.asRedis())

    const id = await bus.publish(makeAnalysisStarted())

    expect(typeof id).toBe('string')
    expect(fake.xadd).toHaveBeenCalledTimes(1)
    const args = (fake.xadd as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!
    expect(args[0]).toBe(STREAM_BY_TYPE['analysis.started'])
  })

  it('rejects an event whose envelope is invalid', async () => {
    const fake = new FakeRedis()
    const bus = new RedisStreamsEventBus(fake.asRedis())

    await expect(bus.publish({ ...makeAnalysisStarted(), eventId: 'not-a-uuid' } as DomainEvent)).rejects.toThrow()
    expect(fake.xadd).not.toHaveBeenCalled()
  })
})

describe('RedisStreamsEventBus.subscribe', () => {
  it('delivers each entry to the handler exactly once and ACKs on success', async () => {
    const fake = new FakeRedis()
    const bus = new RedisStreamsEventBus(fake.asRedis())

    await bus.publish(makeAnalysisStarted())
    await bus.publish({ ...makeAnalysisStarted(), eventId: '00000000-0000-0000-0000-000000000002' })

    const handler = vi.fn().mockResolvedValue(undefined)
    const controller = new AbortController()

    const subscribe = bus.subscribe({
      streams: [STREAM_BY_TYPE['analysis.started']],
      consumerGroup: 'audit',
      consumerName: 'test-1',
      handler,
      blockMs: 50,
      signal: controller.signal,
    })

    // Wait for the loop to drain pending entries, then stop.
    await new Promise(resolve => setTimeout(resolve, 150))
    controller.abort()
    await subscribe

    expect(handler).toHaveBeenCalledTimes(2)
    expect(fake.xack).toHaveBeenCalledTimes(2)
  })

  it('does not ACK when the handler throws (entry stays for redelivery)', async () => {
    const fake = new FakeRedis()
    const bus = new RedisStreamsEventBus(fake.asRedis())
    await bus.publish(makeAnalysisStarted())

    const handler = vi.fn().mockRejectedValue(new Error('boom'))
    const controller = new AbortController()

    const subscribe = bus.subscribe({
      streams: [STREAM_BY_TYPE['analysis.started']],
      consumerGroup: 'audit',
      consumerName: 'test-2',
      handler,
      blockMs: 50,
      signal: controller.signal,
      logger: { warn: vi.fn(), error: vi.fn() },
    })

    await new Promise(resolve => setTimeout(resolve, 100))
    controller.abort()
    await subscribe

    expect(handler).toHaveBeenCalled()
    expect(fake.xack).not.toHaveBeenCalled()
  })

  it('ACKs (drops) malformed payloads instead of wedging the loop', async () => {
    const fake = new FakeRedis()
    // Inject a raw entry with an invalid event JSON straight into the
    // fake's stream so we don't pay the schema check on the publish side.
    ;(fake.xadd as unknown as (...args: unknown[]) => Promise<string>)(
      STREAM_BY_TYPE['analysis.started'],
      'MAXLEN',
      '~',
      '100000',
      '*',
      'event',
      '{"not":"a-domain-event"}',
    )

    const bus = new RedisStreamsEventBus(fake.asRedis())
    const handler = vi.fn()
    const controller = new AbortController()

    const subscribe = bus.subscribe({
      streams: [STREAM_BY_TYPE['analysis.started']],
      consumerGroup: 'audit',
      consumerName: 'test-3',
      handler,
      blockMs: 50,
      signal: controller.signal,
      logger: { warn: vi.fn(), error: vi.fn() },
    })

    await new Promise(resolve => setTimeout(resolve, 100))
    controller.abort()
    await subscribe

    expect(handler).not.toHaveBeenCalled()
    expect(fake.xack).toHaveBeenCalledTimes(1)
  })
})
