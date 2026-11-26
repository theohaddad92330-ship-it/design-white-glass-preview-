import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2179.36 — LA GARDE ANTI-DOUBLON « Créer le besoin ».
 *
 * `POST /rfp/:id/need` n'avait aucune trace de son propre passage : deux clics
 * (double-clic, requête relancée après un timeout réseau) créaient deux
 * `project_needs` pour le même appel d'offres. `need_id` retient l'identifiant
 * du besoin créé — la SEULE porte d'écriture (#2571.2) le pose une fois, et le
 * contrôleur refuse tout second appel tant qu'il est déjà posé.
 *
 * ADDITIVE, NULLABLE, sans FK ni CHECK : un dossier jamais transformé lit
 * simplement `NULL`, jamais un besoin deviné. Pas de contrainte de clé
 * étrangère vers `project_needs` — un besoin archivé ou retiré ne doit pas
 * faire échouer une lecture de l'appel d'offres qui l'a produit.
 */
export class RfpNeedId1796001513927 implements MigrationInterface {
  name = 'RfpNeedId1796001513927'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfps ADD COLUMN IF NOT EXISTS need_id uuid;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfps DROP COLUMN IF EXISTS need_id;
    `)
  }
}
