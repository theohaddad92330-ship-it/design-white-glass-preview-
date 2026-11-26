import { OAuthCleanupService } from './oauth-cleanup.service'
import type { OAuthGrantsService } from './oauth-grants.service'

describe('OAuthCleanupService', () => {
  const makeGrants = () => ({ cleanupExpired: jest.fn().mockResolvedValue(undefined) })

  it('sweeps directly when no lock service is wired (single instance)', async () => {
    const grants = makeGrants()
    const svc = new OAuthCleanupService(grants as unknown as OAuthGrantsService)

    await svc.sweep()

    expect(grants.cleanupExpired).toHaveBeenCalledTimes(1)
  })

  it('sweeps under the "oauth-cleanup" singleton lock when wired (multi-replica)', async () => {
    const grants = makeGrants()
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const svc = new OAuthCleanupService(grants as unknown as OAuthGrantsService, locks as never)

    await svc.sweep()

    expect(locks.withLock).toHaveBeenCalledWith('oauth-cleanup', expect.any(Function))
    expect(grants.cleanupExpired).toHaveBeenCalledTimes(1)
  })

  it('does nothing when another replica holds the tick lock', async () => {
    const grants = makeGrants()
    const locks = { withLock: jest.fn().mockResolvedValue(false) }
    const svc = new OAuthCleanupService(grants as unknown as OAuthGrantsService, locks as never)

    await svc.sweep()

    expect(grants.cleanupExpired).not.toHaveBeenCalled()
  })

  it('swallows sweep errors so a failed cleanup never crashes the scheduler', async () => {
    const grants = { cleanupExpired: jest.fn().mockRejectedValue(new Error('db down')) }
    const svc = new OAuthCleanupService(grants as unknown as OAuthGrantsService)

    await expect(svc.sweep()).resolves.toBeUndefined()
  })
})
