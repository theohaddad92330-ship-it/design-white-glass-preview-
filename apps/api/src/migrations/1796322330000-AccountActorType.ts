import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2265.14 (épopée #2851) — étendre le badge « intermédiaire, pas client
 * final » (jusqu'ici limité à /discover) aux comptes déjà créés.
 *
 * `classify_actor_type` (apps/ia/app/services/actor_typology.py) tourne déjà
 * sur le NAF résolu à chaque recherche Phase 1 — ce n'est pas un signal
 * nouveau à collecter, juste un résultat jamais persisté sur `accounts`.
 * Additif, nullable : une ligne non rejouée reste NULL (jamais un `false`
 * deviné) jusqu'à sa prochaine analyse, qui stampe les deux colonnes
 * ensemble (`AccountsService.applyResearch`).
 */
export class AccountActorType1796322330000 implements MigrationInterface {
  public name = 'AccountActorType1796322330000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS actor_type text,
      ADD COLUMN IF NOT EXISTS is_intermediary boolean
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      DROP COLUMN IF EXISTS actor_type,
      DROP COLUMN IF EXISTS is_intermediary
    `)
  }
}
