import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { IaClient } from '../ia/ia.client'
import { killSwitchCut } from '../../common/kill-switches'

/** Break-glass : `RAG_PURGE_DISABLED=true` gèle la purge. */
export function ragPurgeDisabled(): boolean {
  return killSwitchCut('rag.purge')
}

/**
 * La purge mensuelle du magasin de connaissance (tome 7 §38, M3).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST ICI ET PAS DANS LE SERVICE IA
 * ─────────────────────────────────────────────────────────────────────────
 * Le service IA possède `rag_documents` — c'est lui qui efface. Mais il n'a ni
 * ordonnanceur, ni verrou multi-replica, et une purge qui tournerait sur trois
 * instances en même temps ferait trois fois la même lecture pour un seul
 * effacement utile. L'API a les deux depuis longtemps. Le geste destructeur
 * reste donc chez son propriétaire, l'ordonnancement chez le sien.
 *
 * **Le 3 du mois et non le 1er** : le 1er porte déjà la newsletter changelog et
 * les rapports mensuels. Empiler un balayage destructeur sur la matinée la plus
 * chargée du mois rend son échec invisible dans le bruit des autres.
 *
 * 04:40 — après la rétention RGPD (04:17), avant le rafraîchissement de veille
 * (05:20) : purger AVANT que la journée ne commence à écrire évite de compter
 * comme « jamais utilisé » un document qu'une analyse du matin allait citer.
 *
 * **SANS VERROU :** la purge est idempotente — elle sélectionne puis efface, et
 * un second replica qui rejoue trouve les lignes déjà parties. Le geste est
 * destructeur mais convergent : effacer deux fois le même document donne le même
 * état que l'effacer une fois. Un verrou ne protégerait de rien d'autre qu'une
 * ligne de journal en double, au prix d'une dépendance Redis et d'un mode de
 * panne de plus sur un balayage mensuel — et d'un import de service entre
 * modules, la seule dette d'architecture que le dépôt tient au plafond (GA-07).
 * Tenu par GA-76.
 */
@Injectable()
export class RagPurgeScheduler {
  private readonly logger = new Logger(RagPurgeScheduler.name)

  constructor(private readonly ia: IaClient) {}

  @Cron('40 4 3 * *', { name: 'rag-purge', timeZone: 'Europe/Paris' })
  @Correlated('cron:rag-purge.runPurge')
  async runPurge(): Promise<void> {
    if (ragPurgeDisabled()) {
      this.logger.log('Purge RAG désactivée (RAG_PURGE_DISABLED=true) — rien ne sera effacé')
      return
    }
    try {
      const envelope = await this.ia.ragPurge({})
      const data = (envelope as { data?: { examined?: number; purged?: number } })?.data ?? {}
      // Écrit même quand il n'y a rien à faire : un silence ne doit pas se lire
      // comme une panne du balayage.
      this.logger.log(
        `Purge RAG : ${data.purged ?? 0} document(s) effacé(s) sur ${data.examined ?? 0} candidat(s) examiné(s)`,
      )
    } catch (error) {
      // Un geste destructeur qui échoue ne fait RIEN, et le dit. Il n'y a
      // aucune reprise à tenter : le mois suivant repassera sur les mêmes
      // documents, qui n'auront pas rajeuni.
      this.logger.error('Purge RAG en échec — le magasin est intact', { error })
    }
  }
}
