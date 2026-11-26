import { Module } from '@nestjs/common'
import { SingletonLockService } from './singleton-lock.service'

/**
 * Provides the distributed cron-tick lock ({@link SingletonLockService}).
 * Imported by every module hosting an `@Cron` so that at N replicas a
 * scheduled job runs exactly once per tick. Self-contained (repo rule #7):
 * it only needs REDIS_URL, and without it the lock degrades to a direct
 * run — removing this module (and the injections) restores the plain
 * single-instance behaviour.
 */
@Module({
  providers: [SingletonLockService],
  exports: [SingletonLockService],
})
export class LocksModule {}
