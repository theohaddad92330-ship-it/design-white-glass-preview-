import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3895 — LA PORTÉE ENTITÉ DU GROUPE d'une note (décision Louis 11/10).
 *
 * Une note achats écrite sur Sanofi peut valoir aussi pour Sanofi Pasteur : son
 * auteur le DIT, le produit ne l'infère jamais. `also_applies_to_account_ids`
 * porte les AUTRES comptes (du même groupe) pour lesquels la note vaut ; le
 * compte d'origine reste `entity_id`. Vide par défaut : toute note existante
 * reste celle de son seul compte, comportement d'avant inchangé.
 *
 * Pas de clé étrangère sur un tableau : l'appartenance au même espace ET au même
 * groupe est vérifiée par le service avant d'écrire. La contrainte NOMMÉE
 * (GA-177) ne tient que la TAILLE — le contrat la borne à 20 — et naît dans la
 * MÊME migration que la colonne, donc avant tout code qui écrit (GA-11/GA-12).
 */
export class NoteGroupScope1796440244871 implements MigrationInterface {
  name = 'NoteGroupScope1796440244871'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS also_applies_to_account_ids uuid[] NOT NULL DEFAULT '{}'
    `)
    await queryRunner.query(`ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_group_scope_size_check`)
    await queryRunner.query(`
      ALTER TABLE notes ADD CONSTRAINT notes_group_scope_size_check
        CHECK (cardinality(also_applies_to_account_ids) <= 20)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS notes_group_scope_idx ON notes USING gin (also_applies_to_account_ids)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS notes_group_scope_idx`)
    await queryRunner.query(`ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_group_scope_size_check`)
    await queryRunner.query(`ALTER TABLE notes DROP COLUMN IF EXISTS also_applies_to_account_ids`)
  }
}
