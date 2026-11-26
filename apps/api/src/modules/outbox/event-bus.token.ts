/**
 * NestJS DI token for the EventBus implementation. We bind it to a
 * `RedisStreamsEventBus` in `OutboxModule` but tests can swap in an
 * in-memory bus through this token.
 */
export const EVENT_BUS = Symbol('EVENT_BUS')
