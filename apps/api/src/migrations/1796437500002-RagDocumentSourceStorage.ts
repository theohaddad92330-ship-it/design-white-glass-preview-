import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3803 (3803.1) — l'ORIGINAL d'un document déposé : ce que la base doit
 * accepter AVANT le code qui l'écrit (07/10/2026, GA-11/GA-12).
 *
 *  1. `storage_objects_domain_check` gagne `rag_document_source`, EN FIN de
 *     liste — reprise de la DERNIÈRE déclaration
 *     (`1796412754293-RfpSourceDocumentStorageDomain`), jamais d'une plus
 *     ancienne.
 *  2. `rag_documents.source_object_id` — le lien du document vers son
 *     original. `ON DELETE SET NULL` : un objet effacé ramène le document à
 *     « original non conservé », il ne bloque jamais une suppression (la
 *     remise à neuf de la salle de démonstration efface les deux tables).
 *  3. Un index partiel : le balayage des originaux ORPHELINS
 *     (`StorageService.purgeOrphanRagDocumentSources`) demande « cet objet
 *     est-il encore porté par un document ? » à chaque objet balayé.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est touchée. Les documents
 * déjà déposés n'ont pas d'original (il n'a jamais été gardé) et restent à
 * `NULL` — aucun rattrapage possible, l'aperçu le dit.
 */
export class RagDocumentSourceStorage1796437500002 implements MigrationInterface {
  public name = 'RagDocumentSourceStorage1796437500002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source'))
    `)
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD COLUMN IF NOT EXISTS source_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_documents_source_object_idx
        ON rag_documents (source_object_id) WHERE source_object_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS rag_documents_source_object_idx`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP COLUMN IF EXISTS source_object_id`)
    // ⚠️ La contrainte de domaine n'est PAS rétrécie : des objets
    // `rag_document_source` peuvent exister, et les effacer pour redescendre
    // serait une suppression de données par une migration de retour.
  }
}
