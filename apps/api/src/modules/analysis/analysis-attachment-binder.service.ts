import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'

/**
 * #3623 (reste) — rattache au compte, AU LANCEMENT, les documents que l'auteur a joints à l'analyse.
 *
 * Avant : le web envoyait les pièces en `personal`, lançait, puis les rattachait au compte quand il
 * existait — pendant ces secondes le document restait lisible par TOUTES les autres analyses de son
 * auteur. Désormais le compte est créé par `AnalysisService.start` AVANT la mise en file : ce service
 * range les pièces dans `account` à ce moment, avant que la moindre phase ne lise la base. Il n'y a
 * plus de fenêtre.
 *
 * N'importe aucun service voisin (GA-07) : seulement l'entité `rag_documents`, schéma partagé.
 * Bornes : l'AUTEUR et la portée `personal` — un document d'un collègue, ou déjà rangé (un doublon
 * qui garde sa portée), ne bouge jamais.
 */
@Injectable()
export class AnalysisAttachmentBinderService {
  private readonly logger = new Logger(AnalysisAttachmentBinderService.name)

  constructor(@InjectRepository(RagDocumentEntity) private readonly docs: Repository<RagDocumentEntity>) {}

  /** Renvoie le nombre de documents rattachés ; 0 sur échec (le lancement ne tombe jamais pour ça). */
  async bindToAccount(documentIds: readonly string[], accountId: string, userId: string): Promise<number> {
    if (documentIds.length === 0) return 0
    try {
      const result = await this.docs.update(
        { id: In([...documentIds]), user_id: userId, scope: 'personal' },
        { scope: 'account', account_id: accountId, conversation_id: null },
      )
      return result.affected ?? 0
    } catch (cause) {
      // Les pièces restent `personal` : le web retente le rattachement une fois le compte ouvert.
      this.logger.warn('Rattachement des pièces jointes impossible', { accountId, cause })
      return 0
    }
  }
}
