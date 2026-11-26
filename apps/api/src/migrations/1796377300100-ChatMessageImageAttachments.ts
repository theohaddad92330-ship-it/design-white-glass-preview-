import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2876 (#2433.4) — l'IMAGE de conversation ENVOYÉE avec un message, conservée
 * AVEC lui.
 *
 * `chat_messages.attachments` (`1795510000000`) ne porte que des pièces
 * DURABLES (`rag_documents`, cas b) : une image de conversation (cas a,
 * éphémère) n'y a jamais d'`id` — elle vit sous son propre domaine de
 * stockage (`chat_image_attachment`, `storage_objects`, 30 jours, décision
 * du 28/09/2026 par analogie avec `chat_voice_message`). Avant cette colonne,
 * la preuve visuelle d'un message ENVOYÉ ne survivait ni à un rechargement du
 * fil, ni à la relecture par un autre membre de l'espace : seule une URL
 * `blob:` locale existait, jamais persistée.
 *
 * ADDITIVE ET NULLABLE (GA-11/GA-12) : le schéma s'élargit AVANT le code qui
 * écrit. `NULL` est l'état de tout l'existant et se lit « aucune image jointe
 * à ce message » — jamais un message cassé.
 *
 * Métadonnées SEULEMENT : l'identifiant `storage_objects` (domaine
 * `chat_image_attachment`) et le NOM retrouvé dans l'espace de l'appelant au
 * moment de l'écriture (`ChatMessagesService.resolveImageAttachments`),
 * jamais le contenu du fichier — même discipline que `attachments`.
 *
 * Rétention : aucun balayage de plus — la colonne pend de la ligne du message
 * et part avec elle (fil supprimé, compte effacé RGPD art. 17, salle de
 * démonstration remise à zéro), exactement comme `attachments`.
 */
export class ChatMessageImageAttachments1796377300100 implements MigrationInterface {
  name = 'ChatMessageImageAttachments1796377300100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_attachments jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS image_attachments;
    `)
  }
}
