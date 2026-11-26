import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { killSwitchCut } from '../../common/kill-switches'
import { Correlated } from '../../correlation-id/background-correlation'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { returnedCount } from '../../database/returned-rows'

/** L'âge au-delà duquel un document de fil SANS message est purgé — 24 h (Louis, 13/09/2026). */
const THREAD_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Combien de documents partent PAR PASSAGE. Même raison que la purge des
 * fichiers échus : aucune instruction de ce dépôt n'est une suppression de
 * masse, et un arriéré qui part en plusieurs nuits laisse le temps de l'arrêter.
 */
export const THREAD_ORPHAN_BATCH = 200

/**
 * #1954 — la requête, UNE instruction, bornée et paramétrée.
 *
 * Ce qu'elle ne peut PAS atteindre, et la clause qui le tient :
 *  - un document de la base de l'ESN : `scope = 'conversation'`, dehors ET
 *    dedans (la ligne effacée est re-filtrée, pas seulement sélectionnée) ;
 *  - un fil qui a au moins un message : `NOT EXISTS` sur `chat_messages` ;
 *  - un autre espace portant la même clé de fil : le message doit être dans le
 *    MÊME espace que le document ;
 *  - un document de moins de 24 h : `created_at < $1` ;
 *  - une salle de démonstration : `w.is_demo = false`, la convention des
 *    balayages du dépôt (`crm-core/duplicates.sweeper.ts`,
 *    `playbooks/interventions.sweeper.ts`). Le dépôt y est de toute façon
 *    refusé (`RagController.ingest`) : la clause n'est pas là pour ce qui
 *    existe, mais pour qu'un semis futur ne se fasse pas effacer la nuit.
 *  - un document sans espace (`workspace_id` NULL) : la jointure l'écarte.
 */
export const THREAD_ORPHAN_PURGE_SQL = `
  DELETE FROM rag_documents
   WHERE scope = 'conversation'
     AND id IN (
       SELECT d.id
         FROM rag_documents d
         JOIN workspaces w ON w.id = d.workspace_id AND w.is_demo = false
        WHERE d.scope = 'conversation'
          AND d.conversation_id IS NOT NULL
          AND d.created_at < $1
          AND NOT EXISTS (
            SELECT 1
              FROM chat_messages m
             WHERE m.workspace_id = d.workspace_id
               AND m.conversation_id = d.conversation_id
          )
        ORDER BY d.created_at
        LIMIT $2
     )
   RETURNING id`

/**
 * Le nombre de documents que CETTE requête a effacés, lu par `returnedCount` —
 * jamais à la main : TypeORM rend `[lignes, nombre]` pour un DELETE … RETURNING.
 * `null` quand la réponse n'a pas cette forme — « je n'ai pas pu lire » n'est pas « rien ».
 */
function purgedCountOf(raw: unknown): number | null {
  return Array.isArray(raw) ? returnedCount(raw) : null
}

/**
 * L'interrupteur d'arrêt. **Seule** lecture autorisée de cette capacité (GA-84)
 * — la variable ne se lit que dans le registre.
 */
export function ragThreadOrphanPurgeDisabled(): boolean {
  return killSwitchCut('rag.thread_orphan_purge')
}

/**
 * #1954 — LA PURGE DES PIÈCES JOINTES DONT LA CONVERSATION N'A JAMAIS EXISTÉ.
 *
 * Un document « pour cette conversation » est conservé tant que le fil existe
 * (décision de Louis, 12/09/2026) : supprimé avec lui, masqué quand il est
 * rangé. Mais un fichier joint dans un fil où personne n'a jamais écrit n'a
 * aucun fil à supprimer : il ne se voit nulle part (ni Connaissances, ni aucun
 * autre fil) et restait pour toujours. Louis a tranché le 13/09/2026 : purge
 * après 24 h, chaque nuit, avec interrupteur, jamais un document de la base.
 *
 * Elle vit dans l'API et non dans le service IA : l'API a l'ordonnanceur, et la
 * requête est une seule instruction SQL — aucun appel inter-services à rater.
 *
 * **SANS VERROU :** le geste est idempotent par construction. Deux replicas qui
 * partent à la même minute exécutent la même instruction : la première efface,
 * la seconde ne trouve plus rien (sa suppression ne rend aucune ligne). Une
 * instruction unique est atomique : un échec n'efface rien. Le seul coût d'un
 * doublon est une ligne de journal en trop ; un verrou ferait dépendre une
 * rétention promise à l'écran de la disponibilité de Redis.
 */
@Injectable()
export class RagThreadOrphanPurgeScheduler {
  private readonly logger = new Logger(RagThreadOrphanPurgeScheduler.name)

  constructor(
    @InjectRepository(RagDocumentEntity)
    private readonly docs: Repository<RagDocumentEntity>,
  ) {}

  /**
   * Rend le nombre de documents effacés, ou `null` quand on ne sait pas —
   * échec ou réponse illisible. « Je n'ai pas pu lire » n'est pas « rien ».
   */
  async purgeOrphans(now: Date = new Date()): Promise<number | null> {
    const cutoff = new Date(now.getTime() - THREAD_ORPHAN_AGE_MS)
    try {
      const purged = purgedCountOf(
        await this.docs.manager.query(THREAD_ORPHAN_PURGE_SQL, [cutoff.toISOString(), THREAD_ORPHAN_BATCH]),
      )
      if (purged === null) {
        this.logger.error('Purge des pièces jointes sans conversation : résultat illisible, comptage impossible', {
          tags: { 'rag.op': 'thread_orphan_purge' },
        })
        return null
      }
      // Un journal CHIFFRÉ : ni identifiant, ni titre, ni contenu. Écrit même à
      // zéro — un silence ne doit pas se lire comme une panne du balayage.
      this.logger.log(
        `Purge des pièces jointes sans conversation : ${purged} document(s) effacé(s) sur un plafond de ${THREAD_ORPHAN_BATCH}` +
          (purged === THREAD_ORPHAN_BATCH ? ' (lot plein — le reste la nuit suivante)' : ''),
      )
      return purged
    } catch (error) {
      this.logger.error('Purge des pièces jointes sans conversation en échec — rien n’est effacé', {
        error,
        tags: { 'rag.op': 'thread_orphan_purge' },
      })
      return null
    }
  }

  /** 03:53 chaque nuit — à l'écart de 03:41 (fichiers échus) et de 04:17 (RGPD). */
  @Cron('53 3 * * *', { name: 'rag-thread-orphan-purge', timeZone: 'Europe/Paris' })
  @Correlated('cron:rag-thread-orphan-purge.sweep')
  async sweep(): Promise<void> {
    if (ragThreadOrphanPurgeDisabled()) {
      // Un interrupteur posé n'est PAS une panne : il a été posé exprès.
      this.logger.log('Purge des pièces jointes sans conversation : capacité coupée, aucun document n’est effacé.')
      return
    }
    await this.purgeOrphans()
  }
}
