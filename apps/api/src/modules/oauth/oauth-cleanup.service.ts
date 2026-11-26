import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { OAuthGrantsService } from './oauth-grants.service'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Sweeps expired authorization codes and refresh tokens hourly. `ScheduleModule`
 * is booted process-wide (see outbox.module), so this `@Cron` is discovered
 * without re-importing it here. The sweep is an idempotent DELETE — the
 * singleton lock just keeps N replicas from racing redundant sweeps each tick.
 */
@Injectable()
export class OAuthCleanupService {
  private readonly logger = new Logger(OAuthCleanupService.name)

  constructor(
    private readonly grants: OAuthGrantsService,
    // Cron-tick lock — `@Optional()` so direct-`new` specs need no stub.
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('17 * * * *', { name: 'oauth-cleanup' })
  @Correlated('cron:oauth-cleanup.sweep')
  async sweep(): Promise<void> {
    try {
      await withSingletonLock(this.locks, 'oauth-cleanup', async () => {
        await this.grants.cleanupExpired()
      })
    } catch (error) {
      this.logger.error('OAuth cleanup sweep failed', { error })
    }
  }
}
