import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4427.3 — les statuts Lemlist étaient relus à l'affichage et jamais gardés : une relecture en échec ne laissait
 * rien. `lemlist_lead_pushes` garde désormais le DERNIER statut relu (`last_statuses`, jsonb) et sa date
 * (`statuses_read_at`). Additif : aucune ligne n'est réécrite, aucune contrainte posée (le code valide la forme).
 */
export class LemlistLeadLastStatuses1796574900002 implements MigrationInterface {
  public name = 'LemlistLeadLastStatuses1796574900002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lemlist_lead_pushes
        ADD COLUMN IF NOT EXISTS last_statuses jsonb,
        ADD COLUMN IF NOT EXISTS statuses_read_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lemlist_lead_pushes
        DROP COLUMN IF EXISTS last_statuses,
        DROP COLUMN IF EXISTS statuses_read_at
    `)
  }
}
