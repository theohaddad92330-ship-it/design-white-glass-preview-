import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { ManualProvisioningService, type ManualClientRow } from './manual-provisioning.service'

/** What the sweep found, for the caller that wants the numbers rather than the log. */
interface ManualBillingSweepReport {
  /** Invoice-billed clients examined. */
  examined: number
  /** Clients carrying at least one alert. */
  flagged: number
  /** Commitments that ended with nothing invoiced after them. */
  endedUnrenewed: number
  /** Started periods with no invoice recorded. */
  invoicesMissing: number
  /** Emitted invoices past their payment term. */
  invoicesUnpaid: number
}

/**
 * LE BALAYAGE QUI FAIT SORTIR L'ÉCHÉANCE DU BACK-OFFICE.
 *
 * La colonne « engagement » de l'écran Facturation dit déjà tout — à condition
 * que quelqu'un ouvre l'écran. C'est exactement le défaut d'origine déplacé
 * d'un cran : une phrase dans `notes` que personne ne relit, remplacée par une
 * colonne que personne ne regarde. Un client dont l'engagement s'est achevé en
 * novembre continuerait de consommer ses 600 crédits en février sans qu'aucune
 * facture n'ait été émise.
 *
 * Ce passage quotidien relit les mêmes faits par la MÊME dérivation
 * (`billingHealth` via `listManualClients`) et les écrit dans le journal, d'où
 * ils partent vers Sentry. Deux calculs distincts finiraient par raconter deux
 * histoires différentes du même client, et l'opérateur n'aurait aucun moyen de
 * savoir laquelle croire.
 *
 * ⚠️ Il n'ENVOIE rien et ne SUSPEND rien. Aucun compte n'est coupé à
 * l'échéance : le produit n'a jamais eu cette porte, et une suspension
 * automatique sur un contrat mal saisi couperait un client qui paie.
 *
 * Interrupteur d'urgence : `MANUAL_BILLING_SWEEP_DISABLED=true`.
 */
@Injectable()
export class ManualBillingSweepService {
  private readonly logger = new Logger(ManualBillingSweepService.name)

  constructor(
    private readonly provisioning: ManualProvisioningService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /** 07:10 Europe/Paris — dans la première heure de bureau, pas au milieu de
   *  la nuit où l'alerte attend huit heures avant d'être lue. */
  @Cron('10 7 * * *', { name: 'manual-billing-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:manual_billing.sweep')
  async runDailySweep(): Promise<void> {
    await withSingletonLock(this.locks, 'manual-billing-sweep', async () => {
      await this.sweep()
    })
  }

  async sweep(): Promise<ManualBillingSweepReport> {
    const empty: ManualBillingSweepReport = {
      examined: 0,
      flagged: 0,
      endedUnrenewed: 0,
      invoicesMissing: 0,
      invoicesUnpaid: 0,
    }

    if (killSwitchCut('billing.manual_sweep')) {
      this.logger.log('Balayage des contrats sur facture désactivé (interrupteur posé)')
      return empty
    }

    const clients = await this.provisioning.listManualClients()
    const report: ManualBillingSweepReport = { ...empty, examined: clients.length }

    for (const client of clients) {
      const alerts = client.health.alerts
      if (alerts.length === 0) continue
      report.flagged += 1
      report.endedUnrenewed += alerts.filter(a => a.kind === 'commitment_ended_unrenewed').length
      report.invoicesMissing += alerts.filter(a => a.kind === 'invoice_missing').length
      report.invoicesUnpaid += alerts.filter(a => a.kind === 'invoice_unpaid').length
      this.report(client)
    }

    this.logger.log(
      `Contrats sur facture — ${report.examined} examiné(s), ${report.flagged} à traiter ` +
        `(${report.endedUnrenewed} engagement(s) échu(s) sans renouvellement, ` +
        `${report.invoicesMissing} facture(s) manquante(s), ${report.invoicesUnpaid} impayée(s))`,
    )
    return report
  }

  /**
   * Une ligne par client à traiter.
   *
   * Toujours `logger.warn`, quelle que soit la gravité : c'est un signal MÉTIER, pas une
   * panne. Il a ses propres canaux — la colonne « engagement » de l'écran Facturation et
   * l'alerte back-office `checkManualEngagementChurn` — et en `error` il remplissait
   * Sentry d'une alarme chaque nuit (BELLUM-API-7). La gravité reste dans le tag
   * `billing.manual`.
   *
   * ⚠️ Aucun montant, aucun e-mail : l'espace et sa gravité suffisent à
   * retrouver la ligne dans le back-office, et un journal n'est pas l'endroit
   * où recopier les conditions commerciales d'un client.
   */
  private report(client: ManualClientRow): void {
    const summary = client.health.alerts
      .map(alert =>
        alert.window ? `${alert.kind}(${alert.window.start}, J+${alert.days})` : `${alert.kind}(J+${alert.days})`,
      )
      .join(' · ')
    const meta = {
      tags: { 'billing.manual': client.health.severity },
      contexts: {
        billing: {
          workspaceId: client.workspaceId,
          severity: client.health.severity,
          commitmentEnd: client.health.commitmentEnd,
          windowsDue: client.health.windowsDue,
          windowsInvoiced: client.health.windowsInvoiced,
        },
      },
    }
    const line = `Contrat sur facture à traiter — ${client.workspaceName} : ${summary}`

    this.logger.warn(line, meta)
  }
}
