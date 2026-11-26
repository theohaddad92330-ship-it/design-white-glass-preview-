import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { killSwitchCut } from '../../common/kill-switches'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { AutomationRunnerService } from './automation-runner.service'

/**
 * Lot L-D1 (#4167) — le passage du MATIN des automatisations.
 *
 * Même motif que le balayeur des routines : un cron, un verrou singleton (à N
 * répliques, un seul processus prépare), un interrupteur d'arrêt
 * (`AUTOMATION_RULES_DISABLED`). Une fois par jour ouvré à 06:20 UTC — avant que
 * les commerciaux n'ouvrent « À traiter » ; le journal unique par signal rend un
 * second passage sans effet.
 */
@Injectable()
export class AutomationRulesScheduler {
  private readonly logger = new Logger(AutomationRulesScheduler.name)

  constructor(
    private readonly runner: AutomationRunnerService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('20 6 * * 1-5', { name: 'automation-morning-run' })
  @Correlated('cron:automation.morning_run')
  async morningRun(): Promise<void> {
    if (killSwitchCut('automation.morning_run')) return
    await withSingletonLock(this.locks, 'automation-morning-run', async () => {
      const result = await this.runner.runAll()
      if (result.acted) this.logger.log(`Automations: ${result.acted} action(s) sur ${result.rules} règle(s)`)
    })
  }
}
