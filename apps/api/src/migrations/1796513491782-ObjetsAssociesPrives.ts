import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.34 (#4128) — un drapeau de confidentialité sur les trois objets que la
 * fiche Contact liste en « Dossiers associés » : projets (`opportunities`),
 * besoins (`project_needs`) et missions.
 *
 * Ajout seulement, `DEFAULT false` : tout objet existant reste partagé avec
 * l'espace — la visibilité par défaut ne bouge pas. Un objet privé n'est vu que
 * de son porteur (`owner_id`) et de qui gère l'équipe.
 */
export class ObjetsAssociesPrives1796513491782 implements MigrationInterface {
  name = 'ObjetsAssociesPrives1796513491782'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['opportunities', 'project_needs', 'missions']) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['opportunities', 'project_needs', 'missions']) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS is_private`)
    }
  }
}
