import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4034.2 — le CV ORIGINAL est conservé (Louis 12/10/2026, « je veux voir le
 * fichier, l'aperçu du CV ajouté »).
 *
 * Une colonne `text NULL` : le chemin de l'objet dans le seau PRIVÉ du
 * stockage (`<workspace_id>/cv/<document_id>/<nom>`). `mime_type` et
 * `size_bytes` existent déjà sur la table (`1789374912846-TalentPool.ts`).
 *
 * `NULL` pour tout document déjà en base : seul son texte a été gardé, et
 * l'aperçu le DIT (« Original non conservé pour ce CV ») — aucun rattrapage,
 * aucun fichier inventé. La RLS de `consultant_documents` (par espace) couvre
 * la nouvelle colonne ; le binaire, lui, ne sort que par une URL signée
 * fabriquée par l'API après le contrôle de droit.
 */
export class ConsultantDocumentStoragePath1796457448611 implements MigrationInterface {
  public name = 'ConsultantDocumentStoragePath1796457448611'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS storage_path text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultant_documents DROP COLUMN IF EXISTS storage_path`)
  }
}
