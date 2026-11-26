import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2180.40) — détection de doublon par hash documentaire.
 *
 * `rfps` n'avait aucun moyen de reconnaître qu'un document déjà importé dans
 * l'espace revenait une seconde fois : rien ne comparait un nouvel import aux
 * dossiers existants. Additive et NULLABLE : les dossiers importés AVANT
 * cette colonne n'ont jamais eu leur hash calculé — `NULL` le dit, jamais un
 * hash inventé après coup pour un contenu qu'on ne relit pas. Indexée avec
 * `workspace_id` : la recherche de doublon ne compare jamais entre espaces
 * (GA-43 — le coût d'accès, et ici la donnée elle-même, ne s'agrègent jamais
 * entre espaces concurrents).
 */
export class RfpDocumentHash1796322803417 implements MigrationInterface {
  public name = 'RfpDocumentHash1796322803417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfps ADD COLUMN IF NOT EXISTS document_hash char(64);
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_rfps_workspace_document_hash ON rfps (workspace_id, document_hash);
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
