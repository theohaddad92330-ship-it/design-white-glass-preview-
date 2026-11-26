import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
 * DÉCLARÉ. Huit colonnes ADDITIVES, toutes NULLABLE (scalaires) ou vides par
 * défaut (tableaux) comme le reste du profil progressif : le questionnaire
 * ne bloque jamais, une question passée reste NULL/`{}`, jamais devinée.
 *
 * ⚠️ Ces colonnes N'ENTRENT NULLE PART dans les droits :
 * `workspace-permission.guard.ts` reste la SEULE autorité sur ce qui est
 * AUTORISÉ (GA-26). Elles cadrent seulement ce que Laura PROPOSE — voir
 * `packages/contracts/src/schemas/authority-scope.ts` et
 * `apps/ia/app/prompts/laura_authority_scope.py`.
 */
export class AuthorityScope1795712440422 implements MigrationInterface {
  name = 'AuthorityScope1795712440422'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS decisions_alone text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS decisions_to_validate text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS people_managed text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS recruitment_accounts_authority text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS staffing_authority text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS margin_billing_authority text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tools_access text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS invite_authority text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS decisions_alone;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS decisions_to_validate;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS people_managed;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS recruitment_accounts_authority;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS staffing_authority;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS margin_billing_authority;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tools_access;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS invite_authority;
    `)
  }
}
