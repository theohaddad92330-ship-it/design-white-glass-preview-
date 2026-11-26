import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2180.54) — le domaine de stockage du fichier SOURCE d'un appel
 * d'offres : ce que la base doit accepter AVANT le code (30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `storage_objects_domain_check` gagne `rfp_source_document`, EN FIN de
 * liste. La liste est reprise de la DERNIÈRE déclaration
 * (`1796350603311-ChatImageAttachments`), jamais d'une plus ancienne (GA-11).
 * Sans cet élargissement, le premier document RFP rangé lèverait une
 * violation de contrainte : « une valeur qui voyage du code vers la base voit
 * sa contrainte SQL élargie AVANT le code qui l'écrit » (GA-11, GA-12).
 *
 * ⚠️ AUCUNE durée de conservation n'est écrite ici : `retention_until` est
 * une DATE calculée UNE fois au dépôt (`storedFileRetentionUntil`, cinq ans
 * pour ce domaine — même durée que `need_document`), et la purge existante la
 * lit sans connaître aucun domaine.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est touchée, aucune valeur
 * n'est retirée d'une contrainte.
 */
export class RfpSourceDocumentStorageDomain1796412754293 implements MigrationInterface {
  public name = 'RfpSourceDocumentStorageDomain1796412754293'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ La contrainte n'est PAS rétrécie : des objets `rfp_source_document`
    // peuvent exister, et les effacer pour redescendre serait une
    // suppression de données par une migration de retour.
    void queryRunner
  }
}
