import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add the COMMERCIAL lifecycle column (Théo restitution p.39 : l'onglet « À
 * suivre » était câblé sur `status='analyzing'`, un état d'ANALYSE transitoire,
 * au lieu d'un tri commercial persistant). `commercial_status` est orthogonal
 * au `status` d'analyse : inbox / watching / opportunity / customer / archived.
 *
 * SAFE : ajout de colonne avec défaut, backfill dérivé de l'existant, aucun
 * effacement. Le backfill pré-classe les comptes déjà analysés pour que les
 * onglets « À suivre » / « Opportunités » soient peuplés immédiatement — le
 * commercial ré-ajuste ensuite manuellement.
 *  - status='archived'                          → 'archived'
 *  - status='completed' ET priority_score ≥ 7.5 → 'opportunity'
 *  - status='completed' (score < 7.5 ou NULL)   → 'watching'
 *  - le reste (analyzing/error/canceled)        → 'inbox'
 */
export class CommercialStatus1784900100000 implements MigrationInterface {
  public name = 'CommercialStatus1784900100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS commercial_status text NOT NULL DEFAULT 'inbox'
    `)

    await queryRunner.query(`
      UPDATE accounts
      SET commercial_status = CASE
        WHEN status = 'archived' THEN 'archived'
        WHEN status = 'completed' AND priority_score >= 7.5 THEN 'opportunity'
        WHEN status = 'completed' THEN 'watching'
        ELSE 'inbox'
      END
    `)

    // Onglets de la liste filtrent sur cette colonne — index partiel léger.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS accounts_commercial_status_idx
      ON accounts (workspace_id, commercial_status)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_commercial_status_idx`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS commercial_status`)
  }
}
