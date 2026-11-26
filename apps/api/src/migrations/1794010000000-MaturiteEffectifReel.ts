import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Maturité commerciale + effectif réel décomposé — lot L15 (#2034, #2035).
 *
 * Le questionnaire ne posait qu'une bande d'effectif TOTALE et aucune
 * situation de maturité de vie de l'ESN. Six colonnes ADDITIVES, toutes
 * NULLABLE comme le reste du Temps 1 et du profil progressif : le
 * questionnaire ne bloque jamais, une question passée reste NULL — jamais
 * devinée à `0` ni remplie d'une valeur inventée.
 *
 * `available_consultants_band` (#2035.5) N'EST PAS ici : la colonne existe
 * déjà depuis la migration 1780000000000 (elle avait un lecteur IA,
 * `sales_context.py::_bench_band`, mais aucune question ni entrée de contrat
 * pour l'alimenter). Ajouter une seconde fois la même colonne romprait
 * `ADD COLUMN IF NOT EXISTS` en silence sur les environnements où elle est
 * déjà là — ce migration-ci reste dans son SEUL périmètre : les 6 colonnes
 * neuves.
 */
export class MaturiteEffectifReel1794010000000 implements MigrationInterface {
  name = 'MaturiteEffectifReel1794010000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS esn_maturity_situation text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS active_clients_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS revenue_recurrence text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_concentration_risk text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS company_growth_goal text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultants_managed_by_user_band text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS esn_maturity_situation;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS active_clients_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS revenue_recurrence;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_concentration_risk;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS company_growth_goal;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultants_managed_by_user_band;
    `)
  }
}
