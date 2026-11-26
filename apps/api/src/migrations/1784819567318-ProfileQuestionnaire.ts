import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le profil commercial progressif — restitution V2 §21-30.
 *
 * Le rapport remplace le « questionnaire 24h » par 30 questions en 6 blocs. Les
 * 11 questions du Temps 1 et les 5 du Temps 2 avaient déjà leurs colonnes ; ce
 * sont les 27 champs restants, tous NULLABLE parce que le questionnaire ne
 * bloque jamais et que chaque question se passe.
 *
 * Additive et idempotente : aucune colonne existante n'est touchée, aucune
 * valeur n'est écrite. Un profil qui ne répond à rien reste exactement ce qu'il
 * était, et les prompts se comportent comme avant (le mapping vers
 * `profile_data` ignore les champs vides).
 */
export class ProfileQuestionnaire1784819567318 implements MigrationInterface {
  name = 'ProfileQuestionnaire1784819567318'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS user_role text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS role_tenure text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS industry_tenure text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS individual_goal text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS monthly_target text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS company_age text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS company_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultants_on_mission text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultants_in_pipe text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS team_overlap text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ramp_up_capacity text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS avg_deal_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS target_margin text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS portfolio_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS accounts_relationship_status text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_calls text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_emails text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_linkedin text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS proactivity_level text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS public_sector_practice text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS regulated_sector_readiness text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS partner_relationship text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS go_to_market_channels text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS sales_routine text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS sales_blockers text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS shared_data_scope text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS user_role;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS role_tenure;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS industry_tenure;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS individual_goal;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS monthly_target;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS company_age;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS company_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultants_on_mission;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultants_in_pipe;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS team_overlap;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ramp_up_capacity;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS avg_deal_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS target_margin;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS portfolio_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS accounts_relationship_status;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_calls;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_emails;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_linkedin;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS proactivity_level;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS public_sector_practice;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS regulated_sector_readiness;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS partner_relationship;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS go_to_market_channels;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS sales_routine;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS sales_blockers;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS shared_data_scope;
    `)
  }
}
