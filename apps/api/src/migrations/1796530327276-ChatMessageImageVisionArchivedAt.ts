import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2876 (décision Louis 14/10) — ARCHIVER, pas supprimer. Les zones vision
 * (`image_attachments[].regions`/`.objects`, lot W8) d'une image dont la
 * rétention (30 jours, `chat_image_attachment`) est dépassée sortaient de
 * tout affichage SANS que rien ne le dise : le jsonb du message les gardait
 * pour toujours, qu'elles citent une image encore présente dans
 * `storage_objects` ou déjà purgée.
 *
 * `image_vision_archived_at` est le SEUL état qui tranche : `NULL` = vision
 * encore lisible (tout l'existant) ; posé = la lecture du fil (écran, et
 * tout futur appelant modèle) rend un stub `{id, name}` seul, jamais les
 * zones ni les objets — `ChatMessagesService.archiveExpiredImageVision` les
 * pose, `listThread` les respecte. La LIGNE elle-même n'est jamais touchée :
 * « on archive, on ne supprime pas » (agent_docs/doctrine.md).
 *
 * ADDITIVE ET NULLABLE (GA-11/GA-12) : le schéma s'élargit AVANT le code qui
 * écrit. Aucune contrainte à poser — une colonne nullable n'en a besoin
 * d'aucune.
 */
export class ChatMessageImageVisionArchivedAt1796530327276 implements MigrationInterface {
  name = 'ChatMessageImageVisionArchivedAt1796530327276'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_vision_archived_at timestamptz;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS image_vision_archived_at;
    `)
  }
}
