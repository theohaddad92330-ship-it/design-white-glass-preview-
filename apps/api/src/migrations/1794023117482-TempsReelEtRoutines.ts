import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Capacité réelle + continuité des dossiers — lot L19 (#2050, #2051).
 *
 * Neuf colonnes ADDITIVES sur `esn_profiles`. Rien n'est retiré, rien n'est
 * renommé, aucune contrainte n'est resserrée : le code qui tourne pendant le
 * déploiement ne voit aucune différence.
 *
 * ⚠️ TROIS COLONNES POUR LE TEMPS, PAS UNE (#2050.11 / .12 / .13). Le temps
 * ANNONCÉ, le temps réellement PROTÉGÉ et le temps RÉSIDUEL sont trois faits
 * distincts. Une colonne unique aurait forcé le produit à choisir lequel des
 * trois il stocke — et c'est exactement le chiffre faux que l'issue combat.
 * Le résiduel n'est pas non plus une colonne CALCULÉE : soustraire deux bandes
 * dont l'une est absente rendrait un nombre que personne n'a déclaré
 * (« non mesuré n'est jamais 0 »).
 *
 * Les sept colonnes de choix simple sont NULLABLE : une question passée reste
 * NULL, jamais devinée ni remplie d'une valeur de remplissage. Les quatre
 * colonnes de liste sont `text[] NOT NULL DEFAULT '{}'`, comme les cinq listes
 * du profil progressif (`go_to_market_channels`, `sales_routine`, …) : un
 * tableau vide n'est pas une valeur inventée, c'est l'absence de sélection — et
 * les catalogues portent chacun une option explicite (« Aucune de ces habitudes
 * ne tient aujourd'hui », « Je ne sais pas encore où ça décroche ») pour que le
 * constat de vide puisse être DÉCLARÉ plutôt que déduit d'une liste vide.
 */
export class TempsReelEtRoutines1794023117482 implements MigrationInterface {
  name = 'TempsReelEtRoutines1794023117482'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_sales_time_declared text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_sales_time_protected text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_sales_time_residual text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS workload_variability text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS protected_slot_capacity text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS weekly_sales_time_slots text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS competing_workloads text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS dossier_continuity_practices text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS dossier_continuity_breaks text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_sales_time_declared;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_sales_time_protected;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_sales_time_residual;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS workload_variability;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS protected_slot_capacity;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS weekly_sales_time_slots;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS competing_workloads;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS dossier_continuity_practices;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS dossier_continuity_breaks;
    `)
  }
}
