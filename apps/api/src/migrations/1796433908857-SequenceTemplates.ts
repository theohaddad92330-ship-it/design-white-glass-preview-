import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3756.1 — la BIBLIOTHÈQUE de modèles de séquence d'un espace : une campagne
 * déjà écrite par l'ESN (secteur × tier, étapes J+n, objet, corps avec
 * variables `{{firstName}}`) importée une fois, appliquée contact par contact.
 *
 * Un modèle n'est PAS une campagne multi-contacts (doctrine c74) : l'appliquer
 * crée une séquence MONO-contact étiquetée du nom du modèle.
 *
 * Contraintes posées AVANT le code qui les écrit (GA-11/GA-12) : tier A/B/C ou
 * absent, délai ≥ 0, position ≥ 0. `ON DELETE CASCADE` partout (une FK sans
 * cascade a déjà cassé le reset de la démo).
 */
export class SequenceTemplates1796433908857 implements MigrationInterface {
  name = 'SequenceTemplates1796433908857'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sequence_templates (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        name          text NOT NULL,
        sector        text,
        tier_label    text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT sequence_templates_tier_label_check CHECK (tier_label IS NULL OR tier_label IN ('A', 'B', 'C'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sequence_templates_workspace_idx ON sequence_templates (workspace_id)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sequence_template_steps (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id   uuid NOT NULL REFERENCES sequence_templates (id) ON DELETE CASCADE,
        position      integer NOT NULL,
        delay_days    integer NOT NULL DEFAULT 0,
        subject       text NOT NULL DEFAULT '',
        body          text NOT NULL,
        CONSTRAINT sequence_template_steps_delay_check CHECK (delay_days >= 0),
        CONSTRAINT sequence_template_steps_position_check CHECK (position >= 0)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sequence_template_steps_template_idx ON sequence_template_steps (template_id)`,
    )

    await queryRunner.query(`ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "sequence_templates_member_read" ON sequence_templates`)
    await queryRunner.query(`
      CREATE POLICY "sequence_templates_member_read" ON sequence_templates FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
    await queryRunner.query(`ALTER TABLE sequence_template_steps ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "sequence_template_steps_member_read" ON sequence_template_steps`)
    await queryRunner.query(`
      CREATE POLICY "sequence_template_steps_member_read" ON sequence_template_steps FOR SELECT
        USING (template_id IN (
          SELECT id FROM sequence_templates
          WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sequence_template_steps`)
    await queryRunner.query(`DROP TABLE IF EXISTS sequence_templates`)
  }
}
