import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les trois champs du §4 du tome 1, sur le PROJET.
 *
 * Le tome refuse explicitement (Refus 1) de créer un objet « Opportunity » au-
 * dessus du Projet : le dépôt vient de terminer ce pivot, et le refaire
 * dupliquerait exactement le bug qu'on a corrigé. Ce que la note appelle
 * « Opportunity » existe déjà — c'est le projet au stade `detected`. Il lui
 * manque trois champs, pas une table.
 *
 * `access_mode` — par où on entre, retenu ou recommandé.
 * `access_path` — le chemin : nœuds, relations, source de chaque arête.
 * `addressability` — le score et ses axes, figés au moment du calcul.
 *
 * Les trois sont NULLABLES : les projets existants n'ont ni chemin ni mode, et
 * leur en inventer un serait affirmer par où l'on est entré chez un client
 * qu'on sert depuis deux ans.
 */
export class ProjectAccessFields1789992413058 implements MigrationInterface {
  name = 'ProjectAccessFields1789992413058'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS access_mode TEXT,
        ADD COLUMN IF NOT EXISTS access_path JSONB,
        ADD COLUMN IF NOT EXISTS addressability JSONB
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_access_mode_check
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities
        ADD CONSTRAINT opportunities_access_mode_check
        CHECK (access_mode IS NULL OR access_mode IN (
          'direct_reference','direct_hors_panel','filiale_bu','rang2_soustraitance',
          'portage_marketplace','cotraitance','introduction_relation'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_access_mode_check`)
    await queryRunner.query(`
      ALTER TABLE opportunities
        DROP COLUMN IF EXISTS addressability,
        DROP COLUMN IF EXISTS access_path,
        DROP COLUMN IF EXISTS access_mode
    `)
  }
}
