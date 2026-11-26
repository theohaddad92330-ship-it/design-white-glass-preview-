import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2814 — les pièces jointes d'une facture PRÉPARÉE : ce que la base doit
 * accepter AVANT le code (25/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **`storage_objects_domain_check` gagne `invoice_attachment`, EN FIN de
 *     liste.** La liste est reprise de la DERNIÈRE déclaration
 *     (`1792800080000-ChatVoiceMessages`) — jamais d'une plus ancienne (GA-11).
 *     Sans cet élargissement, la première pièce rangée lèverait une violation
 *     de contrainte (GA-11, GA-12).
 *  2. **`invoice_attachments`** — le LIEN entre une facture préparée (une
 *     mission, un mois `AAAA-MM-01`) et un objet rangé. `workspace_id` est
 *     porté par la ligne : chaque requête le borne, et la RLS la limite aux
 *     membres de l'espace (patron de `mission_milestones`).
 *     `storage_object_id ... ON DELETE SET NULL`, jamais `CASCADE` : la purge
 *     de conservation (dix ans) emporte le FICHIER, jamais la trace qu'une
 *     pièce a été jointe (`1790990000002-StoredFileLinks`). `file_name` est
 *     gardé pour la même raison — la trace se relit sans les octets.
 *
 * ⚠️ AUCUNE durée de conservation n'est écrite ici : `retention_until` est une
 * DATE calculée une fois au dépôt (`storedFileRetentionUntil`, dix ans), et la
 * purge existante la lit sans connaître aucun domaine.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est touchée, aucune valeur
 * n'est retirée d'une contrainte.
 */
export class InvoiceAttachments1796321335332 implements MigrationInterface {
  public name = 'InvoiceAttachments1796321335332'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment'))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        period_month date NOT NULL,
        storage_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE SET NULL,
        file_name text NOT NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT invoice_attachments_period_month_check CHECK (EXTRACT(DAY FROM period_month) = 1),
        CONSTRAINT invoice_attachments_file_name_check CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255)
      );
      CREATE INDEX IF NOT EXISTS invoice_attachments_lookup_idx
        ON invoice_attachments (workspace_id, mission_id, period_month, created_at);
      CREATE INDEX IF NOT EXISTS invoice_attachments_object_idx
        ON invoice_attachments (storage_object_id) WHERE storage_object_id IS NOT NULL;
      ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "invoice_attachments_workspace_read" ON invoice_attachments;
      CREATE POLICY "invoice_attachments_workspace_read" ON invoice_attachments FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_attachments`)
    // ⚠️ La contrainte n'est PAS rétrécie : des objets `invoice_attachment`
    // peuvent exister, et les effacer pour redescendre serait une suppression
    // de données par une migration de retour.
  }
}
