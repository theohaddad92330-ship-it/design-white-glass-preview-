import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2494 — la pièce jointe ENVOYÉE avec un message, conservée AVEC lui.
 *
 * « J'ai ajouté à Laura un CV en contexte pour la conversation puis j'ai
 * envoyé le message, mais avec le message je ne vois pas le fichier attaché » :
 * le composeur affichait le nom déposé (`attachedDocs`) tant que le message
 * n'était pas parti, puis le vidait à l'envoi (`handleSend`) — la bulle du
 * message envoyé, elle, ne portait aucune trace du fichier, ni tout de suite
 * ni après un rechargement du fil.
 *
 * ADDITIVE ET NULLABLE (GA-11/GA-12) : le schéma s'élargit AVANT le code qui
 * écrit. `NULL` est l'état de tout l'existant et se lit « aucune pièce jointe
 * à ce message » — jamais un message cassé.
 *
 * Métadonnées SEULEMENT : l'identifiant `rag_documents` et le NOM retrouvé
 * dans l'espace de l'appelant au moment de l'écriture, jamais le contenu du
 * fichier (qui reste, lui, dans `rag_documents.content`).
 *
 * Rétention : aucun balayage de plus — la colonne pend de la ligne du message
 * et part avec elle (fil supprimé, compte effacé RGPD art. 17, salle de
 * démonstration remise à zéro), exactement comme `context` (`1795100317864`).
 */
export class ChatMessageAttachments1795510000000 implements MigrationInterface {
  name = 'ChatMessageAttachments1795510000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS attachments;
    `)
  }
}
