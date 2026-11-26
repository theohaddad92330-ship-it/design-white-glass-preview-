import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le contexte INDUSTRIEL d'un site (addendum Stelya §8, D-ST-04).
 *
 * « Le vrai grain commercial de l'ingénierie » : un site de 300 personnes chez
 * une PME peut peser plus qu'un site de 30 chez un grand groupe, et la taille du
 * GROUPE ne dit rien de la surface d'un site. Le produit ne connaissait du site
 * que son libellé, sa ville et un effectif nu.
 *
 * Trois règles de vérité du §8.1 tiennent dans ces colonnes :
 *
 *  - `headcount_confidence` — un effectif SAISI, IMPORTÉ ou DÉRIVÉ ne valent pas
 *    la même chose. Sans elle, un chiffre approché se lit comme un chiffre
 *    connu, et c'est sur lui qu'on décide d'aller ou non.
 *  - `headcount_source` — d'où il vient, en clair. Une confiance sans source est
 *    une opinion.
 *  - `site_type` / `activity_sector_codes` / `industrial_function_codes` — ce que
 *    le site FAIT. Un site administratif n'est pas une usine, et le promouvoir
 *    parce qu'un SIRET existe est exactement ce que le §8.1 interdit.
 *
 * Aucun backfill, aucune déduction : un site existant reste sans type et sans
 * confiance, et l'écran dira « à vérifier » plutôt que d'inventer.
 */
export class SiteIndustrialContext1790027384512 implements MigrationInterface {
  name = 'SiteIndustrialContext1790027384512'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Vocabulaire PARTAGÉ avec ce que l'IA produit dans `sitesFrance[].type`
    // (`SITE_TYPES`) : en créer un second garantirait qu'un ciblage « usine » ne
    // rapproche jamais un site typé « usine ».
    await queryRunner.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS site_type text`)
    await queryRunner.query(
      `ALTER TABLE sites ADD COLUMN IF NOT EXISTS activity_sector_codes text[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE sites ADD COLUMN IF NOT EXISTS industrial_function_codes text[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS headcount_confidence text`)
    await queryRunner.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS headcount_source text`)
    await queryRunner.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS headcount_observed_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS headcount_observed_at`)
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS headcount_source`)
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS headcount_confidence`)
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS industrial_function_codes`)
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS activity_sector_codes`)
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS site_type`)
  }
}
