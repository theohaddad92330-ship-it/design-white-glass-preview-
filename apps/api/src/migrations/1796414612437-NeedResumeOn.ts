import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3389.13 — LA DATE DE REPRISE D'UNE VEILLE.
 *
 * « Un besoin éloigné passe en attente AVEC DATE » : `on_hold` + `status_reason`
 * existaient sans date, donc sans échéance à relire. Une colonne `date`
 * NULLABLE, aucun backfill — « pas de date » reste « pas de date », jamais une
 * échéance devinée. Pas de CHECK : une date n'a pas de vocabulaire à contraindre
 * (la règle « seulement sur `on_hold`, jamais dans le passé » vit dans
 * `needResumeOnProblem`, à l'écriture).
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT le code qui écrit la colonne.
 */
export class NeedResumeOn1796414612437 implements MigrationInterface {
  name = 'NeedResumeOn1796414612437'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS resume_on date`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS resume_on`)
  }
}
