import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3819 (lot RBB, décision Louis 11/10/2026) — LES CRITÈRES DE DÉCOUVRIR SUIVENT LE COMPTE.
 *
 * `discover_origin_reason` (migration `1796437712847`, #3914) garde la RAISON
 * calculée qui a fait remonter un compte dans Découvrir. Il manquait SUR QUELS
 * CRITÈRES l'utilisateur l'avait sélectionné — secteur, zone, effectif, signal :
 * trois lots (C2, T04, N03) l'avaient nommé « reste », faute de colonne.
 *
 * `discover_origin_criteria` porte ces critères (codes, pas libellés — forme
 * fixée par `discoverOriginCriteriaSchema`, `packages/contracts`). Le run les
 * reçoit comme hypothèse du vendeur ; le dossier les réaffiche.
 *
 * NULLABLE, additive : un compte venu autrement, antérieur, ou ajouté sans
 * critère posé n'a rien à nommer — jamais une valeur devinée, aucun rattrapage.
 *
 * La contrainte (NOMMÉE, GA-177) ne tient que la FORME — un objet — comme
 * `org_focus_weights_shape_check` : les clés sont validées par le contrat
 * avant d'arriver ici, une CHECK sur les clés se périmerait au premier axe
 * ajouté. Posée dans la MÊME migration que la colonne, donc avant tout code
 * qui écrit (GA-11/GA-12).
 */
export class AccountDiscoverOriginCriteria1796438071493 implements MigrationInterface {
  name = 'AccountDiscoverOriginCriteria1796438071493'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS discover_origin_criteria jsonb
    `)
    await queryRunner.query(`
      ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_discover_origin_criteria_shape_check
    `)
    await queryRunner.query(`
      ALTER TABLE accounts ADD CONSTRAINT accounts_discover_origin_criteria_shape_check
        CHECK (discover_origin_criteria IS NULL OR jsonb_typeof(discover_origin_criteria) = 'object')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_discover_origin_criteria_shape_check`,
    )
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS discover_origin_criteria`)
  }
}
