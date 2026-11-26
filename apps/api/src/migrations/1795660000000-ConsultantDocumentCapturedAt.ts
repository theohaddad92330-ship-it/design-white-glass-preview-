import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2569.2 — « à doublon, la donnée la plus récente gagne. »
 *
 * `captured_at` porte la date RÉELLE du document — le dernier modifié d'une
 * entrée ZIP, ou la date du message qui le portait — jamais la date de dépôt
 * dans l'outil (`created_at` la porte déjà, et deux fichiers importés à la
 * suite l'un de l'autre dans le même lot auraient sinon la même seconde).
 *
 * `NULL` veut dire « date inconnue », jamais « maintenant » : un CV collé à la
 * main ou un fichier sans métadonnée de date exploitable n'en invente pas une.
 * `incomingCvIsMoreRecent` (packages/contracts) traite `NULL` comme perdant
 * toujours la comparaison — « non mesuré » n'est jamais « plus récent ».
 *
 * `consultants.cv_captured_at` porte la MÊME notion pour le `cv_text` ACTUEL
 * de la fiche — la comparaison rapide qui décide si un document plus récent
 * doit le remplacer, sans requêter tous ses documents à chaque import.
 *
 * Porte « ajout seulement » : colonnes nullables, sans défaut, aucune
 * contrainte existante resserrée.
 */
export class ConsultantDocumentCapturedAt1795660000000 implements MigrationInterface {
  public name = 'ConsultantDocumentCapturedAt1795660000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS captured_at timestamptz`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS cv_captured_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS cv_captured_at`)
    await queryRunner.query(`ALTER TABLE consultant_documents DROP COLUMN IF EXISTS captured_at`)
  }
}
