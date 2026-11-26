import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3669.2 (05/10/2026) — le STATUT DE TRAITEMENT par document déposé : reçu,
 * en cours, exploitable, partiellement exploitable, à corriger.
 *
 * Colonne sur `rag_documents` plutôt qu'une table d'import (« à préciser » de
 * l'issue, tranché sans Louis : la recommandation la plus simple) — un document
 * a UN état courant, et la liste « Connaissances » le lit déjà d'une requête.
 *
 * `NULL` = non évalué : les lignes d'avant ne sont JAMAIS rétro-calculées en
 * « exploitable » (doctrine : on n'affiche pas ce qu'on n'a pas). Énumération
 * miroir : `RAG_PROCESSING_STATUSES` (`@bellum/contracts`). Contrainte élargie
 * AVANT le code qui écrit (GA-11/GA-12).
 */
export class RagDocumentProcessingStatus1796433906070 implements MigrationInterface {
  name = 'RagDocumentProcessingStatus1796433906070'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS processing_status text;
      ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_processing_status_check;
      ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_processing_status_check CHECK (processing_status IS NULL OR processing_status IN ('received', 'processing', 'usable', 'partial', 'to_fix'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_processing_status_check;
      ALTER TABLE rag_documents DROP COLUMN IF EXISTS processing_status;
    `)
  }
}
