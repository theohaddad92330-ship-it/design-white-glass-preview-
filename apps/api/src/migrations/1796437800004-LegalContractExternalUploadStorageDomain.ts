import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2422.6 (épopée #2869, lot R24 08/10/2026) — le domaine de stockage de la
 * pièce qu'un contact externe dépose : ce que la base doit accepter AVANT le
 * code qui l'écrit (GA-11/GA-12).
 *
 * `storage_objects_domain_check` gagne `legal_contract_external_upload`, EN
 * FIN de liste — reprise de la DERNIÈRE déclaration
 * (`1796437500002-RagDocumentSourceStorage`), jamais d'une plus ancienne.
 *
 * Additive seulement : aucune ligne existante n'est touchée.
 */
export class LegalContractExternalUploadStorageDomain1796437800004 implements MigrationInterface {
  public name = 'LegalContractExternalUploadStorageDomain1796437800004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source', 'legal_contract_external_upload'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ La contrainte de domaine n'est PAS rétrécie : des objets
    // `legal_contract_external_upload` peuvent déjà exister, et les effacer
    // pour redescendre serait une suppression de données par une migration
    // de retour.
  }
}
