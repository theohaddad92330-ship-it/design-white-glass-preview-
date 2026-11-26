import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2876 (#2433.4) — l'image jointe au chat : ce que la base doit accepter
 * AVANT le code (28/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `storage_objects_domain_check` gagne `chat_image_attachment`, EN FIN de
 * liste. La liste est reprise de la DERNIÈRE déclaration
 * (`1796321335332-InvoiceAttachments`) — jamais d'une plus ancienne (GA-11).
 * Sans cet élargissement, la première image rangée lèverait une violation de
 * contrainte : « une valeur qui voyage du code vers la base voit sa
 * contrainte SQL élargie AVANT le code qui l'écrit » (GA-11, GA-12).
 *
 * ⚠️ AUCUNE durée de conservation n'est écrite ici : `retention_until` est une
 * DATE calculée UNE fois au dépôt (`storedFileRetentionUntil`, 30 jours pour ce
 * domaine — même constante que `chat_voice_message`), et la purge existante la
 * lit sans connaître aucun domaine.
 *
 * ⚠️ Aucune colonne de liaison à `chat_messages` ici : cette tranche range
 * l'image sous un `imageObjectId` opaque, retrouvé par sa propre porte
 * (`GET rag-documents/image/:objectId`, bornée à l'espace de l'appelant) —
 * pas encore rattaché à un message précis. Faire durer la preuve visuelle
 * au-delà de l'onglet qui l'a envoyée reste un chantier séparé.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est touchée, aucune valeur
 * n'est retirée d'une contrainte.
 */
export class ChatImageAttachments1796350603311 implements MigrationInterface {
  public name = 'ChatImageAttachments1796350603311'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ La contrainte n'est PAS rétrécie : des objets `chat_image_attachment`
    // peuvent exister, et les effacer pour redescendre serait une suppression
    // de données par une migration de retour.
    void queryRunner
  }
}
