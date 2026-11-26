import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3266.1 (#3292, tranché sans Louis) — le grain équipe/site/projet d'une
 * opportunité.
 *
 * Même patron que `OpportunityRisks` (#2324.37, migration 1796000718437) :
 * colonne texte NULLABLE, additive et idempotente. Aucun CHECK — la longueur
 * (200) est bornée par le contrat (`createProjectSchema` / `updateProjectScopeSchema`).
 * `NULL` = personne ne l'a écrit ; aucun backfill, aucun périmètre deviné
 * depuis l'org-graph ou le libellé de l'affaire.
 */
export class OpportunityScopeLabel1796372014823 implements MigrationInterface {
  public name = 'OpportunityScopeLabel1796372014823'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS scope_label text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
