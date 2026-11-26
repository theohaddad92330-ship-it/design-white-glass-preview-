import type { Redis } from 'ioredis'
import { DomainEventSchema, STREAM_BY_TYPE, type DomainEvent } from './schemas.js'

/** Surface the bus exposes to publishers (worker, on-demand service) and
 *  consumers (audit logger, future Kafka relay). Kept narrow so a Kafka or
 *  in-memory implementation can drop in without touching call sites. */
export type EventBus = {
  /** Persist `event` to Redis and return the ID Redis assigned. */
  publish(event: DomainEvent): Promise<string>
  /** Block-read the requested streams via XREADGROUP, ACK-on-success. The
   *  returned promise resolves only when the caller invokes ``stop()`` on
   *  the controller passed in via ``signal`` (default behaviour: never). */
  subscribe(opts: SubscribeOptions): Promise<void>
}

export type SubscribeOptions = {
  /** One or more stream names — values from ``STREAM_BY_TYPE`` or
   *  ``ALL_STREAMS``. */
  streams: string[]
  /** Logical consumer group, e.g. ``'analytics-worker'``. Same group across
   *  pods → load balanced; different groups → fanout. */
  consumerGroup: string
  /** Identity of this specific instance, e.g. ``hostname:pid``. Used by
   *  Redis to track per-consumer pending entries. */
  consumerName: string
  /** Called for every event delivered. Throwing skips the ACK, so the same
   *  event will be redelivered (XCLAIM/PEL). Idempotent handlers should
   *  guard with ``eventId``. */
  handler: (event: DomainEvent, redisId: string) => Promise<void>
  /** XREADGROUP COUNT — max events per round-trip. Default 10. */
  batchSize?: number
  /** XREADGROUP BLOCK ms — how long to wait for new entries before
   *  yielding. Default 5000. */
  blockMs?: number
  /** Optional AbortSignal to break the consumption loop cleanly (NestJS
   *  ``OnModuleDestroy`` etc.). */
  signal?: AbortSignal
  /** Optional logger; falls back to ``console`` so the package stays
   *  framework-agnostic. */
  logger?: { warn: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void }
}

const DEFAULT_BATCH = 10
const DEFAULT_BLOCK_MS = 5000
const DEFAULT_MAXLEN = 100_000
const ERROR_BACKOFF_MS = 1000

type ConsoleLike = NonNullable<SubscribeOptions['logger']>
const fallbackLogger: ConsoleLike = {
  warn: (msg, meta) => console.warn(msg, meta ?? ''),
  error: (msg, meta) => console.error(msg, meta ?? ''),
}

/** Redis Streams implementation of ``EventBus`` — at-least-once delivery,
 *  bounded streams (XADD MAXLEN), validated payloads on the publish side. */
export class RedisStreamsEventBus implements EventBus {
  constructor(private readonly redis: Redis) {}

  async publish(event: DomainEvent): Promise<string> {
    // Re-validate at publish time: a typed call site can still drift from
    // the schema (e.g. wrong literal `type`). We fail loud at the boundary
    // instead of letting consumers crash on the parse() round-trip.
    const validated = DomainEventSchema.parse(event)
    const stream = STREAM_BY_TYPE[validated.type]

    // MAXLEN ~ N keeps the stream at roughly N entries — cheap, avoids
    // unbounded growth in dev without paying the cost of exact trimming.
    const id = await this.redis.xadd(
      stream,
      'MAXLEN',
      '~',
      String(DEFAULT_MAXLEN),
      '*',
      'event',
      JSON.stringify(validated),
    )
    if (!id) {
      throw new Error(`Failed to XADD to ${stream} (event=${validated.type} id=${validated.eventId})`)
    }
    return id
  }

  async subscribe(opts: SubscribeOptions): Promise<void> {
    const log = opts.logger ?? fallbackLogger
    const batchSize = opts.batchSize ?? DEFAULT_BATCH
    const blockMs = opts.blockMs ?? DEFAULT_BLOCK_MS

    // Idempotent group create: BUSYGROUP means the group already exists,
    // any other error is fatal (e.g. the stream key collides with a non-
    // stream type).
    for (const stream of opts.streams) {
      try {
        await this.redis.xgroup('CREATE', stream, opts.consumerGroup, '$', 'MKSTREAM')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('BUSYGROUP')) throw err
      }
    }

    while (!opts.signal?.aborted) {
      try {
        const result = (await this.redis.xreadgroup(
          'GROUP',
          opts.consumerGroup,
          opts.consumerName,
          'COUNT',
          String(batchSize),
          'BLOCK',
          String(blockMs),
          'STREAMS',
          ...opts.streams,
          ...opts.streams.map(() => '>'),
        )) as [string, [string, string[]][]][] | null

        if (!result) continue

        for (const [stream, messages] of result) {
          for (const [id, fields] of messages) {
            const idx = fields.indexOf('event')
            if (idx < 0 || idx + 1 >= fields.length) {
              log.warn(`[${opts.consumerName}] missing 'event' field on ${stream}/${id}, ACK to drop`)
              await this.redis.xack(stream, opts.consumerGroup, id)
              continue
            }
            const raw = fields[idx + 1]!
            let parsed: DomainEvent
            try {
              parsed = DomainEventSchema.parse(JSON.parse(raw))
            } catch (err) {
              // Malformed payload won't ever succeed — ACK so it doesn't
              // wedge the consumer. Caller should monitor warn logs to
              // catch this in CI.
              log.error(`[${opts.consumerName}] invalid event payload on ${stream}/${id}, ACK to drop`, err)
              await this.redis.xack(stream, opts.consumerGroup, id)
              continue
            }

            try {
              await opts.handler(parsed, id)
              await this.redis.xack(stream, opts.consumerGroup, id)
            } catch (err) {
              // No ACK → entry stays in the consumer's PEL and is
              // redelivered on the next XREADGROUP. The handler is
              // responsible for idempotency (use eventId).
              log.error(
                `[${opts.consumerName}] handler failed for ${stream}/${id}, leaving unacked for redelivery`,
                err,
              )
            }
          }
        }
      } catch (err) {
        if (opts.signal?.aborted) break
        log.error(`[${opts.consumerName}] xreadgroup loop error, backing off ${ERROR_BACKOFF_MS}ms`, err)
        await new Promise(resolve => setTimeout(resolve, ERROR_BACKOFF_MS))
      }
    }
  }
}
