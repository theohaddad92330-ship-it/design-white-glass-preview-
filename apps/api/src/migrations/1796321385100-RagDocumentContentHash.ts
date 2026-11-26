import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2431.7 (reste) — l'empreinte qui permet de dédoublonner un document RAG
 * CONTRE LA BASE EXISTANTE, pas seulement dans l'archive déposée (le
 * dédoublonnage intra-archive, sha256 côté client, est déjà livré —
 * `rag-zip-ingest.service.ts:93`). Système différent : celui-ci compare un
 * nouveau dépôt à ce qui est DÉJÀ en base, sur les deux chemins d'ingestion
 * (`RagController.ingest` et `RagZipIngestService.ingestZip`), qui passent
 * tous deux par `rag_service.ingest` (apps/ia) — un seul point d'écriture.
 *
 * GA-11/GA-12 — cette migration (le schéma) précède le code Python qui écrit
 * la colonne : `content_hash` est ADDITIVE, nullable, sans contrainte sur les
 * lignes déjà en base (jamais recalculée en silence pour l'existant).
 *
 * L'index est scopé à `content_hash IS NOT NULL` : les lignes historiques
 * (colonne vide) n'y participent pas — inutile de les indexer pour une
 * recherche qui ne les trouvera jamais par empreinte.
 *
 * Idempotent. `down` non supporté (convention du dépôt).
 */
export class RagDocumentContentHash1796321385100 implements MigrationInterface {
  public name = 'RagDocumentContentHash1796321385100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS content_hash text`)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_documents_content_hash
        ON rag_documents (content_hash)
        WHERE content_hash IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
