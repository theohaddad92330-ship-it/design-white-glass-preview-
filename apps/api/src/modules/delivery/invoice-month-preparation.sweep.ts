import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { InvoiceMonthPreparationService } from './invoice-month-preparation.service'

/**
 * #2567 — « préparer chaque mois automatiquement » : le premier jour ouvré, le
 * mois écoulé des missions qui l'ont demandé est PRÉPARÉ. Il n'ENVOIE rien,
 * ne crée rien dans l'outil branché et ne déclare rien « facturé » : la
 * création du brouillon reste un geste humain.
 */
@Injectable()
export class InvoiceMonthPreparationSweep {
  private readonly logger = new Logger(InvoiceMonthPreparationSweep.name)

  constructor(
    private readonly preparations: InvoiceMonthPreparationService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('40 6 * * 1-5', { name: 'invoice-month-preparation', timeZone: 'Europe/Paris' })
  @Correlated('cron:invoice_month_preparation')
  async runDaily(): Promise<void> {
    await withSingletonLock(this.locks, 'invoice-month-preparation', async () => {
      const prepared = await this.preparations.prepareDueMonths(new Date())
      if (prepared > 0) this.logger.log(`Factures du mois écoulé préparées automatiquement : ${prepared} mission(s)`)
    })
  }
}
