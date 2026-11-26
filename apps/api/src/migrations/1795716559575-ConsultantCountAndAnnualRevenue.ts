import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2088.12/.13 (DÉCISION Louis 18/09/2026, point 16) — les deux PREMIERS vrais
 * NOMBRES du questionnaire : le nombre de consultants et le chiffre
 * d'affaires (+ sa période).
 *
 * Trois colonnes ADDITIVES, nullable, GA-11/GA-12 (la contrainte SQL s'élargit
 * avant le code qui écrit) :
 *  - `consultant_count` INTEGER — additive à `consultant_size` (TEXT, la
 *    tranche déjà en place depuis la migration 1780000000000) : celle-ci
 *    n'est NI retirée NI renommée, un profil qui a répondu « 10 à 50
 *    consultants » avant ce lot garde cette réponse lisible telle quelle ;
 *  - `annual_revenue_amount` INTEGER — question entièrement nouvelle, aucune
 *    tranche de chiffre d'affaires n'existait avant ;
 *  - `annual_revenue_period` TEXT — la période que `annual_revenue_amount`
 *    couvre (#2088.13, catalogue `ANNUAL_REVENUE_PERIODS`), sans laquelle un
 *    chiffre d'affaires ne veut rien dire.
 *
 * `CHECK` non signé sur les deux colonnes numériques : un montant ou un
 * effectif négatif n'a pas de sens, mais la borne se pose en base (GA-11)
 * comme le veut la doctrine — Zod (`answers-chiffres-cles.ts`, côté
 * application) la reproduit déjà.
 */
export class ConsultantCountAndAnnualRevenue1795716559575 implements MigrationInterface {
  name = 'ConsultantCountAndAnnualRevenue1795716559575'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultant_count integer;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS annual_revenue_amount integer;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS annual_revenue_period text;
    `)
    // Postgres n'a pas de `ADD CONSTRAINT IF NOT EXISTS` natif : le DROP
    // préalable (`IF EXISTS`) rend la paire rejouable, même convention que
    // 1795490047213-RunProfileLayerVersions.ts.
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_consultant_count_nonneg;
      ALTER TABLE esn_profiles
      ADD CONSTRAINT esn_profiles_consultant_count_nonneg CHECK (consultant_count IS NULL OR consultant_count >= 0);
    `)
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_annual_revenue_amount_nonneg;
      ALTER TABLE esn_profiles
      ADD CONSTRAINT esn_profiles_annual_revenue_amount_nonneg
      CHECK (annual_revenue_amount IS NULL OR annual_revenue_amount >= 0);
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_consultant_count_nonneg;
      ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_annual_revenue_amount_nonneg;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultant_count;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS annual_revenue_amount;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS annual_revenue_period;
    `)
  }
}
