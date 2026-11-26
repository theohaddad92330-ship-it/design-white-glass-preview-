import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { IaClient } from '../ia/ia.client'

/** Documents découpés par passage — un petit lot, jamais tout le parc (#3750.4). */
export const RAG_CHUNK_BACKFILL_BATCH = 20

/**
 * #3750.4 — LE RATTRAPAGE DES MORCEAUX des documents déjà en base.
 *
 * Le découpage par onglet / diapositive / section ne vaut que si les documents
 * DÉJÀ déposés en profitent (doctrine « un correctif de collecte rattrape
 * l'existant ») : un classeur ingéré avant #3750 n'a aucun morceau, son onglet
 * « 07 · Objections » reste invisible tant qu'il n'est pas redécoupé. Le
 * service IA possède la table et le découpage ; l'API possède l'ordonnanceur
 * — même partage que la purge (`RagPurgeScheduler`).
 *
 * - **ciblé** : seuls les documents de plus de 2 000 caractères SANS morceau
 *   (RPC `rag_documents_pending_chunks`) ;
 * - **par petit lot** : `RAG_CHUNK_BACKFILL_BATCH` documents par nuit, le reste
 *   aux nuits suivantes — jamais tout le parc d'un coup ;
 * - **sans geste au déploiement** : un cron de nuit, rien au démarrage.
 *
 * 03:37 (Europe/Paris) — hors de la purge des pièces de fil (03:53) et de la
 * rétention RGPD (04:17).
 *
 * **SANS VERROU :** le rattrapage est idempotent — la RPC ne rend que les
 * documents sans morceau, et la contrainte `UNIQUE (document_id, chunk_index)`
 * refuse le second écrivain si deux replicas tombent sur le même document (le
 * perdant compte un échec, aucune ligne en double). Un verrou ne protégerait
 * de rien d'autre que d'un lot d'embeddings payé deux fois sur un même
 * document, au prix d'une dépendance Redis de plus.
 */
@Injectable()
export class RagChunkBackfillScheduler {
  private readonly logger = new Logger(RagChunkBackfillScheduler.name)

  constructor(private readonly ia: IaClient) {}

  @Cron('37 3 * * *', { name: 'rag-chunk-backfill', timeZone: 'Europe/Paris' })
  @Correlated('cron:rag-chunk-backfill.runBackfill')
  async runBackfill(): Promise<void> {
    try {
      const envelope = await this.ia.ragChunkBackfill({ batchSize: RAG_CHUNK_BACKFILL_BATCH })
      const data = (envelope?.data ?? {}) as { documents?: number; failed?: number }
      // Écrit même quand il n'y a rien à faire : un silence ne se lit pas
      // comme une panne du rattrapage.
      this.logger.log(
        `Rattrapage des morceaux RAG : ${data.documents ?? 0} document(s) découpé(s), ${data.failed ?? 0} en échec`,
      )
    } catch (error) {
      // Rien à réparer : les documents non traités le seront la nuit suivante.
      this.logger.error('Rattrapage des morceaux RAG en échec — le magasin est intact', { error })
    }
  }
}
