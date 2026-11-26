import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { RefreshRefundService } from './refresh-refund.service'

interface RefreshRefundSweepReport {
  /** Espaces qui portent au moins un débit `refresh:` — jamais tout le parc. */
  workspacesExamined: number
  /** Espaces où au moins un débit indu a été rendu ce passage. */
  workspacesRefunded: number
  /** Espaces sautés (timeout, base indisponible…) — retentés la nuit suivante. */
  workspacesFailed: number
}

/**
 * #2650.2 (21/09/2026) — l'APPELANT nocturne qui manquait à
 * `RefreshRefundService.run`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SERVICE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `RefreshRefundController` (`POST internal/admin/credits/refresh-refunds`)
 * restait la SEULE porte du remboursement : un geste d'opérateur, à la main,
 * `dryRun` par défaut. Un débit indu (rafraîchissement déjà payé dans les 6 h,
 * avant #2650.1) ne se remboursait donc que si quelqu'un pensait à le
 * déclencher — exactement le défaut décrit dans `chantiers-livres.md` : « du
 * code juste, calculé, testé, que personne n'appelle ». Ce service est cet
 * appelant : un `@Cron` qui passe chaque nuit, en mode RÉEL, sans qu'un
 * humain ait à s'en souvenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * - PAR ESPACE, jamais agrégé (garde GA-43 : deux espaces sont des
 *   concurrents) — un appel `RefreshRefundService.run(workspaceId, …)` par
 *   espace, une ligne de journal par espace, aucun total combiné entre eux ;
 * - la liste des espaces à examiner vient du registre lui-même (`DISTINCT
 *   workspace_id` sur les débits `consume_enrichment` au motif `refresh:%`) —
 *   pas un balayage de tout le parc : un espace qui n'a jamais eu de débit de
 *   rafraîchissement n'apparaît jamais ici ;
 * - IDEMPOTENT par construction : `RefreshRefundService.run` ne rembourse
 *   qu'un débit dont la ligne de crédit n'existe pas encore (référence unique
 *   par débit, `credit_ledger_refresh_refund_once_idx`) — rejouer ce passage
 *   la nuit suivante ne trouve plus rien à rembourser pour un débit déjà
 *   traité ;
 * - un espace qui ÉCHOUE (timeout, base indisponible) est SAUTÉ ce passage et
 *   journalisé en erreur, jamais remboursé sur une supposition — `unknown`
 *   arrête la reprise pour CET espace, elle ne devine rien, et n'empêche pas
 *   les autres espaces d'être traités ;
 * - la journalisation dit COMBIEN et SUR QUEL espace, jamais une valeur de
 *   clé ni un secret.
 */
@Injectable()
export class RefreshRefundSweepService {
  private readonly logger = new Logger(RefreshRefundSweepService.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly refunds: RefreshRefundService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /** 03:13 Europe/Paris — creux nocturne, à l'écart des balayages de 04:17 et 07:20. */
  @Cron('13 3 * * *', { name: 'refresh-refund-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:refresh_refund.sweep')
  async runNightlySweep(): Promise<void> {
    try {
      await withSingletonLock(this.locks, 'refresh-refund-sweep', async () => {
        await this.sweep()
      })
    } catch (error) {
      this.logger.error('Remboursement nocturne des rafraîchissements en échec — passage annulé', {
        error,
        tags: { 'credits.op': 'refresh_refund.sweep' },
      })
    }
  }

  async sweep(): Promise<RefreshRefundSweepReport> {
    const rows: Array<{ workspace_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT workspace_id
         FROM credit_ledger
        WHERE kind = 'consume_enrichment'
          AND reason LIKE 'refresh:%'
          AND workspace_id IS NOT NULL`,
    )

    let workspacesRefunded = 0
    let workspacesFailed = 0
    for (const { workspace_id: workspaceId } of rows) {
      try {
        // #2650.2 — PAR ESPACE : un appel, un résultat, une ligne de journal.
        // Jamais un lot de plusieurs espaces dans le même geste (GA-43).
        const outcome = await this.refunds.run(workspaceId, { dryRun: false, actor: 'cron' })
        if (outcome.refunds.length > 0) {
          workspacesRefunded += 1
          this.logger.log(`Remboursement nocturne — espace ${workspaceId} : ${outcome.refunds.length} débit(s)`, {
            tags: { 'credits.op': 'refresh_refund.sweep' },
          })
        }
      } catch (error) {
        // Un timeout n'est pas un échec qui se devine : on saute CET espace ce
        // passage, sans toucher au solde, et le prochain passage le retentera.
        workspacesFailed += 1
        this.logger.error(`Remboursement nocturne sauté — espace ${workspaceId}, reporté au prochain passage`, {
          error,
          tags: { 'credits.op': 'refresh_refund.sweep' },
        })
      }
    }

    return { workspacesExamined: rows.length, workspacesRefunded, workspacesFailed }
  }
}
