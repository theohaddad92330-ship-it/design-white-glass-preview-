import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4051 — « Importé le <date> depuis <fichier ou outil> » dans l'historique d'une fiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un import écrit des fiches mais ne laisse AUCUNE trace sur elles : « d'où vient ce contact ? » se
 * répondait en fouillant les journaux de lots. `record_field_audit` dit QUI a changé QUEL champ — pas
 * qu'une fiche est arrivée par un import, ni depuis quoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE TABLE À PART, ADDITION SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne par fiche et par import, jamais mise à jour : l'historique d'une fiche lit la plus récente.
 * `source_label` est le NOM DU FICHIER déposé (`file`) ou le nom de l'outil branché du client (`tool`) —
 * jamais un fournisseur à nous. Aucune ligne existante à requalifier : valeurs NEUVES. Aucune clé
 * étrangère : la trace survit à la fiche (on archive, on ne supprime pas, hors effacement RGPD).
 */
export class RecordImportMarks1796560184000 implements MigrationInterface {
  public name = 'RecordImportMarks1796560184000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS record_import_marks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        source_kind text NOT NULL,
        source_label text NOT NULL,
        imported_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `ALTER TABLE record_import_marks DROP CONSTRAINT IF EXISTS record_import_marks_entity_type_check`,
    )
    await queryRunner.query(`
      ALTER TABLE record_import_marks
        ADD CONSTRAINT record_import_marks_entity_type_check CHECK (entity_type IN ('account', 'contact', 'consultant'))
    `)
    await queryRunner.query(
      `ALTER TABLE record_import_marks DROP CONSTRAINT IF EXISTS record_import_marks_source_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE record_import_marks
        ADD CONSTRAINT record_import_marks_source_kind_check CHECK (source_kind IN ('file', 'tool'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_record_import_marks_entity
        ON record_import_marks (workspace_id, entity_type, entity_id, imported_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS record_import_marks`)
  }
}
