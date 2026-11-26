import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { ChatMessagesService } from './chat-messages.service'

/** La clé d'un fil dans un espace — la même forme que les routes d'archivage. */
type ThreadTarget = {
  /** #2703 — le fil par DÉFAUT appartient à son auteur ; la clé le porte donc. */
  userId: string
  workspaceId: string
  accountId: string | null
  conversationId: string | null
}

/**
 * #1954 — UN DOCUMENT « FIL SEUL » VIT ET MEURT AVEC SON FIL.
 *
 * Décisions de Louis (12/09/2026) : un document joint à Laura sert à la
 * CONVERSATION par défaut (`rag_documents.scope = 'conversation'`), et il est
 * conservé tant que le fil existe — rangé, il est masqué ; ressorti, il revient ;
 * supprimé, il part avec le fil. ⚠️ #2430.9 (20/09/2026) : « supprimer » un fil
 * n'efface plus SES MESSAGES (ils s'archivent) — mais continue d'effacer ses
 * documents « fil seul » via `deleteForThread`, à dessein (un document est un
 * artefact du geste de suppression, pas le contenu du fil ; converger les deux
 * est un chantier séparé, non couvert par la décision du 20/09).
 *
 * Deux gestes, et rien d'autre :
 *  - `readableThread` dit au tour de chat QUEL fil peut lire ses documents
 *    (aucun pour un fil rangé) ;
 *  - `deleteForThread` supprime les documents « fil seul » d'un fil, JAMAIS un
 *    document de l'ESN (`scope = 'workspace'`), jamais un autre fil ou un autre
 *    espace.
 *
 * ⚠️ Service à part plutôt que dans `ChatMessagesService` : il porte le dépôt
 * des documents, et le constructeur de ce dernier est construit à la main par
 * ses suites.
 */
@Injectable()
export class ChatThreadDocumentsService {
  private readonly logger = new Logger(ChatThreadDocumentsService.name)

  constructor(
    private readonly chatMessages: ChatMessagesService,
    @InjectRepository(RagDocumentEntity)
    private readonly docs: Repository<RagDocumentEntity>,
  ) {}

  /**
   * La clé du fil quand ses documents « fil seul » peuvent être lus par ce tour,
   * `undefined` sinon — fil rangé, fil sans clé, ou état illisible.
   *
   * ⚠️ Une lecture qui échoue FERME la porte : « on n'a pas pu vérifier » n'est
   * pas « le fil est vivant ». Le tour de chat continue, sans ces documents.
   */
  async readableThread(target: ThreadTarget): Promise<string | undefined> {
    if (!target.conversationId) return undefined
    try {
      return (await this.chatMessages.isThreadArchived(target)) ? undefined : target.conversationId
    } catch (error) {
      this.logger.warn(`État du fil illisible, ses documents joints ne sont pas lus pour ce tour: ${String(error)}`)
      return undefined
    }
  }

  /**
   * Supprime les documents « fil seul » d'un fil. Rend le nombre supprimé.
   *
   * ⚠️ Sans clé de conversation, RIEN : un `where` sans `conversation_id`
   * viderait tous les documents « fil seul » de l'espace.
   */
  async deleteForThread(args: { workspaceId: string; conversationId: string | null }): Promise<number> {
    if (!args.conversationId) return 0
    const result = await this.docs.delete({
      workspace_id: args.workspaceId,
      conversation_id: args.conversationId,
      scope: 'conversation',
    })
    return result.affected ?? 0
  }
}
