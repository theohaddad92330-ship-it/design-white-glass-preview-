import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { CrmSyncService } from './crm-sync.service'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Le passage quotidien de synchronisation CRM.
 *
 * 04:40 Europe/Paris, avant le rafraîchissement de veille de 05:20 : quand un
 * commercial ouvre son écran le matin, les deux côtés sont déjà rapprochés, et
 * « déjà connu » dit la vérité sur ce que l'équipe a touché la veille.
 *
 * Le verrou singleton est indispensable, pas décoratif : `@Cron` se déclenche
 * sur CHAQUE réplique, et deux passages simultanés écriraient deux fois dans le
 * CRM d'un client. Une double écriture y est visible, contrairement à un double
 * calcul.
 */
@Injectable()
export class CrmSyncScheduler {
  private readonly logger = new Logger(CrmSyncScheduler.name)

  constructor(
    private readonly sync: CrmSyncService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('40 4 * * *', { name: 'crm-sync', timeZone: 'Europe/Paris' })
  @Correlated('cron:crm-sync.runDailySync')
  async runDailySync(): Promise<void> {
    if (!this.locks) {
      // Sans service de verrou (specs, ou déploiement sans base de verrous), on
      // ne lance PAS : mieux vaut ne pas synchroniser que synchroniser deux
      // fois. L'asymétrie est volontaire — le second cas écrit chez un tiers.
      this.logger.warn('CRM sync skipped: no singleton lock available')
      return
    }
    await withSingletonLock(this.locks, 'crm-sync', async () => {
      const outcome = await this.sync.syncAll()
      if (outcome.divergent > 0) {
        this.logger.log('CRM sync found divergences to arbitrate', { divergent: outcome.divergent })
      }
    })
  }
}
