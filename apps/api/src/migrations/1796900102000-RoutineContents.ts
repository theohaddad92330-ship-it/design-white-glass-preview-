import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2843.30 (épopée #2843) — le CONTENU exact d'une routine, réglé PAR ESPACE : un gabarit
 * pour le texte de sa notification. Ligne absente = le texte par défaut ; « revenir au
 * défaut » efface la ligne. Table NEUVE (ajout seulement), bornes posées dès la création,
 * avant le code qui écrit (GA-11/GA-12). Cloisonnée par espace, jamais partagée.
 */
export class RoutineContents1796900102000 implements MigrationInterface {
  name = 'RoutineContents1796900102000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routine_contents (
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        routine_key text NOT NULL,
        template text NOT NULL,
        updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, routine_key),
        CONSTRAINT routine_contents_template_length_check CHECK (char_length(template) BETWEEN 1 AND 1000)
      )
    `)
    await queryRunner.query(`ALTER TABLE routine_contents ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS routine_contents`)
  }
}
