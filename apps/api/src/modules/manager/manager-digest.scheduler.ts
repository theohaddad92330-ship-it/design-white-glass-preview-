import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { ManagerDigestService } from './manager-digest.service'

/**
 * #4158.28 — le lundi matin, 07 h 15 (Europe/Paris), avant le récapitulatif hebdomadaire des commerciaux
 * (08 h) : le manager a sa synthèse avant que l'équipe n'ait la sienne. Verrou singleton : plusieurs
 * réplicas ne produisent qu'un seul passage.
 */
@Injectable()
export class ManagerDigestScheduler {
  private readonly logger = new Logger(ManagerDigestScheduler.name)

  constructor(
    private readonly digest: ManagerDigestService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('15 7 * * 1', { name: 'manager-weekly-digest', timeZone: 'Europe/Paris' })
  @Correlated('cron:manager.runWeeklyDigest')
  async runWeekly(): Promise<void> {
    await withSingletonLock(this.locks, 'manager-weekly-digest', async () => {
      try {
        await this.digest.run()
      } catch (error) {
        this.logger.warn(`Manager weekly digest batch failed (non-fatal): ${(error as Error).message}`)
      }
    })
  }
}
