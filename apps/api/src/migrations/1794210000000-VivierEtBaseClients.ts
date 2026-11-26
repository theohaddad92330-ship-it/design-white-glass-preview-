import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Vivier de consultants et base de clients DÉCLARÉS à l'onboarding — #2046,
 * #2047. Le questionnaire ne demandait rien de ce que l'ESN a DÉJÀ ; sans ça
 * l'audit ne peut dire que ce qui MANQUE, jamais ce qui est EXPLOITABLE.
 *
 * Vingt-cinq colonnes ADDITIVES, toutes NULLABLE : une question passée reste
 * NULL, jamais devinée à `0` ni remplie d'une valeur inventée. Même règle que
 * `1794010000000-MaturiteEffectifReel.ts`, reprise à l'identique.
 *
 * #2047.1 (« clients actifs ») N'EST PAS ici : `active_clients_band` existe
 * déjà depuis la migration 1794010000000 et pose la même question — voir
 * `answers-base-clients.ts` pour le croisement complet.
 */
export class VivierEtBaseClients1794210000000 implements MigrationInterface {
  name = 'VivierEtBaseClients1794210000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_identified_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_qualified_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_available_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_availability_recency_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_avg_tjm_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_mobility_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_consent_status text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_other_processes_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_engagement_reality_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_revalidation_frequency text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_state_interested_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_state_available_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_state_secured_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS talent_pool_state_presentable_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_missions_ongoing_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_missions_completed_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_renewals_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_satisfaction_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_referrals_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_rex_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_case_studies_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_cross_sell_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_deadlines_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_followup_regularity text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_base_followup_owner text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_identified_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_qualified_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_available_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_availability_recency_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_avg_tjm_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_mobility_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_consent_status;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_other_processes_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_engagement_reality_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_revalidation_frequency;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_state_interested_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_state_available_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_state_secured_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS talent_pool_state_presentable_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_missions_ongoing_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_missions_completed_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_renewals_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_satisfaction_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_referrals_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_rex_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_case_studies_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_cross_sell_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_deadlines_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_followup_regularity;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_base_followup_owner;
    `)
  }
}
