import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { InternalKnowledgeDigestService } from './internal-knowledge-digest.service'
import { InternalKnowledgeSyncService } from './internal-knowledge-sync.service'
import { SINGLETON_LOCK, type UnderSingletonLock } from './module-tokens'

/**
 * #3586.2 — la synchro du Drive interne, toutes les 10 minutes (`changes.list`, jeton de page persisté).
 * Sans `INTERNAL_KNOWLEDGE_DRIVE_SA_JSON` / `INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS` le passage rend
 * `disabled` sans le moindre appel réseau. Le verrou de singleton évite que N répliques rejouent le
 * même passage (deux passages concurrents archiveraient puis réinséreraient les mêmes chunks).
 */
@Injectable()
export class InternalKnowledgeScheduler {
  private readonly logger = new Logger(InternalKnowledgeScheduler.name)

  constructor(
    private readonly sync: InternalKnowledgeSyncService,
    private readonly digest: InternalKnowledgeDigestService,
    // Le verrou arrive par un JETON (GA-07 est un cliquet : aucun service d'un autre module n'est importé).
    @Inject(SINGLETON_LOCK) private readonly underLock: UnderSingletonLock,
  ) {}

  @Cron('*/10 * * * *', { name: 'internal-knowledge-drive-sync' })
  @Correlated('cron:internal_knowledge.drive_sync')
  async tick(): Promise<void> {
    try {
      await this.underLock('internal-knowledge-drive-sync', async () => {
        const report = await this.sync.sync()
        if (report.status === 'ok') {
          this.logger.log(
            `internal-knowledge: ${report.mode} — ${report.indexed} indexé(s), ${report.ignored} ignoré(s), ${report.errors} en erreur, ${report.archived} archivé(s)`,
          )
          // #3586 (W2) — en FIN de synchro, sous le même verrou : le digest n'est régénéré (un appel
          // Claude) que si l'empreinte des fichiers indexés a changé.
          const digest = await this.digest.refreshIfChanged()
          if (digest.status === 'regenerated') {
            this.logger.log(`internal-knowledge: digest régénéré (${digest.sizeChars} caractères)`)
          }
        }
      })
    } catch (error) {
      this.logger.error('internal-knowledge: passage en échec', { error })
    }
  }

  /**
   * #3586 — réconciliation COMPLÈTE chaque nuit à 03:00 (Paris), SOUS LE MÊME VERROU que la synchro :
   * les deux ne tournent jamais ensemble. Rattrape ce que `changes.list` ne dit pas (fichier sorti de la
   * portée sans changement émis) ; archive, ne supprime jamais.
   */
  @Cron('0 3 * * *', { name: 'internal-knowledge-drive-reconcile', timeZone: 'Europe/Paris' })
  @Correlated('cron:internal_knowledge.drive_reconcile')
  async reconcileTick(): Promise<void> {
    try {
      await this.underLock('internal-knowledge-drive-sync', async () => {
        const report = await this.sync.reconcile()
        if (report.status === 'ok') {
          this.logger.log(
            `internal-knowledge: réconciliation — ${report.indexed} réindexé(s), ${report.ignored} ignoré(s), ${report.errors} en erreur, ${report.archived} archivé(s)`,
          )
        }
      })
    } catch (error) {
      this.logger.error('internal-knowledge: réconciliation en échec', { error })
    }
  }
}
