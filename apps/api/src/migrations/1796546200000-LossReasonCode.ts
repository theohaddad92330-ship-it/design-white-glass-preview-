import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3989.9 — Décision Louis 15/10/2026 : le motif de perte est une LISTE FERMÉE
 * COMMUNE (`LOSS_REASON_CODES`) + une précision libre facultative (la colonne
 * `loss_reason` existante, texte de l'espace, inchangée).
 *
 * Contrainte posée AVANT le code qui écrit (GA-11 / GA-12), NOMMÉE (GA-177).
 * Ajout seulement : les pertes déjà closes gardent `loss_reason_code = NULL`
 * (« non dit », jamais deviné depuis leur texte).
 */
export class LossReasonCode1796546200000 implements MigrationInterface {
  public name = 'LossReasonCode1796546200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS loss_reason_code text NULL`)
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_loss_reason_code_check`)
    await queryRunner.query(
      `ALTER TABLE opportunities ADD CONSTRAINT opportunities_loss_reason_code_check CHECK (loss_reason_code IS NULL OR loss_reason_code IN ('price', 'competitor_won', 'no_budget', 'project_cancelled', 'bad_timing', 'no_profile_available', 'other'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_loss_reason_code_check`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS loss_reason_code`)
  }
}
