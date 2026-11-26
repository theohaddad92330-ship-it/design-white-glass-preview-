import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4996.4 (DÉCISION Louis 02/11, QCM) — le périmètre d'un membre se choisit par ENTITÉ du client, par BU de NOTRE
 * espace (`business_units`, cf. `business-unit.entity.ts` pour l'homonymie), ou les deux (deux lignes). ÉTENDRE :
 * la contrainte SQL s'élargit AVANT le code qui écrit (GA-11/12).
 *
 * - `business_unit_id` NULLABLE, FK `business_units(id) ON DELETE SET NULL` : une BU supprimée laisse la zone par son
 *   libellé (même règle que l'entité retirée, L1). Les BU s'archivent (`status`) plutôt que se supprimer.
 * - CHECK : une ligne est une entité OU une BU, jamais les deux ; le libellé libre (les deux à NULL) reste permis.
 * - L'unicité du libellé libre exclut désormais les zones de BU (sinon la BU « Lyon » et le texte « Lyon » se
 *   heurteraient). Mêmes lignes couvertes pour l'existant : toutes ont `business_unit_id` NULL.
 * - Aucune donnée réécrite, aucune ligne supprimée.
 */
export class AccountTeamScopesBusinessUnit1796650000000 implements MigrationInterface {
  public name = 'AccountTeamScopesBusinessUnit1796650000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_team_scopes
        ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES business_units(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_team_scopes_entity_or_bu_check') THEN
          ALTER TABLE account_team_scopes
            ADD CONSTRAINT account_team_scopes_entity_or_bu_check CHECK (entity_id IS NULL OR business_unit_id IS NULL);
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_bu_active
        ON account_team_scopes (account_id, user_id, business_unit_id) WHERE removed_at IS NULL AND business_unit_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_team_scopes_bu_idx
        ON account_team_scopes (business_unit_id) WHERE removed_at IS NULL AND business_unit_id IS NOT NULL
    `)
    await queryRunner.query(`DROP INDEX IF EXISTS account_team_scopes_label_active`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active
        ON account_team_scopes (account_id, user_id, lower(btrim(label))) WHERE removed_at IS NULL AND entity_id IS NULL AND business_unit_id IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS account_team_scopes_label_active`)
    await queryRunner.query(`DROP INDEX IF EXISTS account_team_scopes_bu_active`)
    await queryRunner.query(`DROP INDEX IF EXISTS account_team_scopes_bu_idx`)
    await queryRunner.query(
      `ALTER TABLE account_team_scopes DROP CONSTRAINT IF EXISTS account_team_scopes_entity_or_bu_check`,
    )
    await queryRunner.query(`ALTER TABLE account_team_scopes DROP COLUMN IF EXISTS business_unit_id`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active
        ON account_team_scopes (account_id, user_id, lower(btrim(label))) WHERE removed_at IS NULL AND entity_id IS NULL
    `)
  }
}
