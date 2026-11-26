import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le CONTEXTE d'un projet et d'une mission (addendum Stelya §4, §9, D-ST-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE ÇA CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seul secteur que le produit connaissait était celui du COMPTE
 * (`accounts.sector`), et c'est lui que le matching lisait. Le retour bêta est
 * net : « le secteur doit être porté par la mission, pas par le compte ». Un
 * même compte industriel porte un projet « automatisation d'une ligne
 * automobile » et un projet « maintenance nucléaire » : le premier appelle des
 * automaticiens d'expérience automobile, le second des fiabilistes habilités.
 * Leur donner le même secteur — celui du groupe — les rend interchangeables
 * alors qu'ils ne le sont pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun backfill. `accounts.sector` n'est PAS recopié sur les projets existants :
 * ce serait exactement l'erreur que le retour dénonce, écrite une fois pour
 * toutes en base. Un projet sans secteur déclaré reste sans secteur, et le
 * matching le DIT (« repli sur le secteur du compte ») au lieu de faire passer
 * une hypothèse pour une donnée.
 *
 * `inherited_from_project_at` porte la règle d'héritage du §9.1 : une mission
 * copie le contexte de son projet À LA CONVERSION, et une correction ultérieure
 * de la mission ne réécrit JAMAIS le projet — l'horodatage dit quand la copie a
 * eu lieu, donc si ce qu'on lit vient du projet ou d'une correction humaine.
 */
export class ProjectDomainContext1790020847361 implements MigrationInterface {
  name = 'ProjectDomainContext1790020847361'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Secteurs d'application RÉELS de la demande (codes `APPLICATION_SECTORS`).
    // Un tableau et non une colonne unique : un projet d'industrialisation peut
    // servir l'automobile ET le ferroviaire, et forcer un choix en perdrait un.
    await queryRunner.query(
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS application_sector_codes text[] NOT NULL DEFAULT '{}'`,
    )
    // La famille de prestation achetée (code de la taxonomie des 66).
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS primary_domain_code text`)
    // Le SITE où la demande se porte. Nullable, jamais déduit du siège.
    await queryRunner.query(
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL`,
    )

    await queryRunner.query(
      `ALTER TABLE missions ADD COLUMN IF NOT EXISTS application_sector_codes text[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS primary_domain_code text`)
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS inherited_from_project_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS inherited_from_project_at`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS primary_domain_code`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS application_sector_codes`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS site_id`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS primary_domain_code`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS application_sector_codes`)
  }
}
