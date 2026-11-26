import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo D settings-integrations.N3 — l'onglet « À relire » : un écart tranché « garder Bellum » se RETIENT.
 *
 * `sync_record_events.kept_fields` liste les champs d'un écart dont l'utilisateur a choisi la valeur Bellum.
 * Sans elle, le même écart reviendrait dans la liste à chaque passage. Ajout seul (non nul, défaut vide) :
 * les journaux déjà écrits restent valides, aucun champ n'est considéré tranché.
 *
 * `entity_label` : le nom de la fiche (contact ou société) au moment de l'écart, pour que l'onglet nomme la fiche sans
 * relire la table des contacts. Nullable : un écart déjà journalisé n'a pas de nom, l'écran ne l'invente pas.
 */
export class SyncConflictKeptFields1796575024619 implements MigrationInterface {
  public name = 'SyncConflictKeptFields1796575024619'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sync_record_events ADD COLUMN IF NOT EXISTS kept_fields text[] NOT NULL DEFAULT '{}'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sync_record_events DROP COLUMN IF EXISTS entity_label`)
    await queryRunner.query(`ALTER TABLE sync_record_events DROP COLUMN IF EXISTS kept_fields`)
  }
}
