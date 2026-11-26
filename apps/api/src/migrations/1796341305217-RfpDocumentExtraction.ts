import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2180.9-.26) — la structure DOSSIER (douze catégories : entité
 * juridique, calendrier, Q/R, critères de notation, pièces demandées, profils
 * demandés, volumes, tarifs, conditions contractuelles, contraintes
 * sécurité/conformité, interlocuteurs, format de remise), distincte de
 * `requirements` (jsonb, une ligne de conformité par exigence).
 *
 * Additive et NULLABLE, même discipline que `document_hash`
 * (`1796322803417-RfpDocumentHash`) : les dossiers importés AVANT cette
 * colonne n'ont jamais eu leur extraction calculée — `NULL` le dit, jamais un
 * objet aux douze champs vides fabriqué après coup pour un document qu'on ne
 * relit pas.
 */
export class RfpDocumentExtraction1796341305217 implements MigrationInterface {
  public name = 'RfpDocumentExtraction1796341305217'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfps ADD COLUMN IF NOT EXISTS document_extraction jsonb;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
