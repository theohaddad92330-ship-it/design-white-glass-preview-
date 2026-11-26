import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4615 (BELLUM-API-3B) — `GET /crm/import/status` rendait 500 : `column e.entity_label does not exist`.
 *
 * CAUSE : la requête et l'entité sont justes ; c'est la migration 1796575024619 (SyncConflictKeptFields) qui
 * annonçait `entity_label` dans son commentaire et le supprimait dans `down()` mais ne l'ajoutait jamais dans
 * `up()`. Elle a déjà tourné en production : on ne la réécrit pas, on ajoute la colonne ici.
 * Ajout seul, nullable : un écart déjà journalisé n'a pas de nom, l'écran ne l'invente pas.
 */
export class SyncRecordEventsEntityLabel20261026230417 implements MigrationInterface {
  public name = 'SyncRecordEventsEntityLabel20261026230417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sync_record_events ADD COLUMN IF NOT EXISTS entity_label text`)
  }

  public async down(): Promise<void> {
    // Ajout seul : la colonne reste (elle est aussi retirée par le down() de 1796575024619).
  }
}
