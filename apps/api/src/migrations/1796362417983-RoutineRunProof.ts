import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2205.54 (épopée #2843) — la PREUVE de ce qu'une exécution de routine a
 * réellement produit, jamais devinée : `NULL` quand l'exécuteur n'a rien de
 * vérifiable à citer (routine qui ne fabrique rien de tangible, rien trouvé
 * ce passage, ou un artefact créé sans confirmation d'où il a atterri — même
 * garde que `mailDraftHasProof`, GA-26). Un lien ou un identifiant vérifié
 * sinon, jamais un texte recomposé depuis `outcome`.
 *
 * Additive : colonne NULLABLE sans défaut — les lignes déjà écrites n'ont
 * jamais porté de preuve structurée (seul `outcome`, en prose), `NULL` dit
 * exactement ça, jamais une preuve inventée après coup.
 */
export class RoutineRunProof1796362417983 implements MigrationInterface {
  name = 'RoutineRunProof1796362417983'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_runs ADD COLUMN IF NOT EXISTS proof_ref text NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE routine_runs DROP COLUMN IF EXISTS proof_ref`)
  }
}
