import type { Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'
import IORedis from 'ioredis'
import type { Server } from 'socket.io'
import { parseRedisUrl } from './redis-connection'

/**
 * Handle owned by the gateway that actually attached the adapter — closing it
 * quits the underlying Redis pub/sub pair on shutdown (SIGTERM/SIGINT via
 * Nest's shutdown hooks) so a redeploy doesn't leak connections.
 */
export type RedisAdapterHandle = { close(): Promise<void> }

/**
 * Servers that already carry the Redis adapter. All our gateways (analysis +
 * profiler) share ONE Socket.IO server — same port, default namespace — so
 * only the first gateway to init must create the pub/sub pair; a second
 * attach would just leak a redundant pair of Redis connections.
 */
const attachedServers = new WeakSet<Server>()

/**
 * Attach the Socket.IO Redis adapter so ``server.to(room).emit(...)`` fans
 * out across *every* API replica, not just the process that runs the emitting
 * code path (analysis worker, IA progress callback handler...). Without it,
 * at N>1 replicas a client connected to replica B never receives events
 * emitted on replica A and its UI freezes.
 *
 * Gated on REDIS_URL. With no Redis configured (dev / local, single instance)
 * the default in-memory adapter is correct, so this is a no-op and behaviour
 * at one instance is unchanged.
 *
 * Idempotent per server: every gateway calls this from its `afterInit` (repo
 * rule #7 — removing any single module must not silently drop the adapter),
 * and only the first caller creates and owns the Redis clients. Callers keep
 * the returned handle and close it from `onModuleDestroy`.
 *
 * NOTE: the adapter only fans out *messages*. Socket.IO's HTTP long-polling
 * handshake + upgrade must still return to the same replica, so the load
 * balancer needs session affinity (or the client forced to
 * `transports: ['websocket']`).
 */
export function attachRedisAdapterOnce(server: Server, logger: Logger): RedisAdapterHandle | undefined {
  if (!process.env['REDIS_URL']) {
    logger.log('REDIS_URL unset — Socket.IO using in-memory adapter (single instance)')
    return undefined
  }
  if (attachedServers.has(server)) return undefined
  attachedServers.add(server)

  const { host, port, password } = parseRedisUrl()
  const pubClient = new IORedis({ host, port, password, maxRetriesPerRequest: null })
  const subClient = pubClient.duplicate()
  server.adapter(createAdapter(pubClient, subClient))
  logger.log('Socket.IO Redis adapter attached — cross-replica fan-out enabled')

  return {
    close: async (): Promise<void> => {
      await Promise.allSettled([pubClient.quit(), subClient.quit()])
    },
  }
}
