import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà du
 * commercial. Six colonnes ADDITIVES, toutes NULLABLE : le questionnaire ne
 * bloque jamais, une question passée reste NULL, jamais devinée.
 *
 * Toutes des TRANCHES (décision Louis 18/09 : une tranche est plus honnête
 * qu'un chiffre faussement précis) — colonne `text` libre comme
 * `sales_team_size`, jamais de contrainte CHECK énumérée : le catalogue de
 * valeurs vit dans `packages/contracts/src/schemas/onboarding/answers-equipe.ts`
 * (même pattern que `1795712440422-AuthorityScope.ts`).
 */
export class QuiFaitQuoiEquipeElargie1789741699223 implements MigrationInterface {
  name = 'QuiFaitQuoiEquipeElargie1789741699223'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS associates_count text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS recruiters_team_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS delivery_team_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS marketing_team_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ops_team_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS team_coordination_mode text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS associates_count;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS recruiters_team_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS delivery_team_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS marketing_team_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ops_team_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS team_coordination_mode;
    `)
  }
}
