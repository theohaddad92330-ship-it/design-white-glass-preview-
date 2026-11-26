import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les personnes qu'un humain a DÉCLARÉES sur un compte (#1103).
 *
 * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
 * soit pouvoir décrire des éléments et ensuite ça intègre. »
 *
 * Miroir exact de `org_rejected_items`, posée par la migration
 * `1787946118427` et pour la même raison : chaque run réécrit
 * `raw_analysis.org.orgGraph` à neuf. Une personne saisie à la main y vivrait
 * donc jusqu'à la réanalyse suivante, puis disparaîtrait sans un mot — on
 * aurait demandé du travail à quelqu'un et on l'aurait jeté en silence.
 *
 * Une colonne, hors du blob, parce que c'est exactement ce qui doit SURVIVRE au
 * blob. `[]` par défaut : les dossiers antérieurs gardent le comportement
 * d'avant, à l'octet près.
 *
 * Additive et idempotente.
 */
export class OrgDeclaredPeople1790104738291 implements MigrationInterface {
  public name = 'OrgDeclaredPeople1790104738291'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_declared_people jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS org_declared_people`)
  }
}
