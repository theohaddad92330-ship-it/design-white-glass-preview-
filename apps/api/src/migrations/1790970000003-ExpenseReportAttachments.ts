import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_report_attachments` — les justificatifs, et leur CONSERVATION
 * (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `retention_until` — la troisième pièce du refus levé
 * ─────────────────────────────────────────────────────────────────────────────
 * Une échéance de conservation est STOCKÉE, pas recalculée à l'affichage, et
 * c'est délibéré : la durée légale est un paramètre qui peut changer (pays,
 * réforme), et une échéance recalculée bougerait rétroactivement sur des pièces
 * déjà archivées. Ce qu'on doit pouvoir opposer à un contrôle, c'est la règle
 * en vigueur AU MOMENT du dépôt. `receiptRetentionUntil` (@bellum/contracts) la
 * calcule une fois, à l'écriture, avec la durée passée en paramètre.
 *
 * `RECEIPT_RETENTION_YEARS_FR = 10` est le Code de commerce FRANÇAIS (L123-22).
 * Il est nommé côté contrats et passé en argument — jamais codé en dur dans le
 * calcul, pour la raison exacte qui a fait des jours fériés un paramètre du
 * relevé d'activité : dix ans est vrai en France et faux ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `byte_size` ET `download_url` NULLABLES — deux absences qui se DISENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `byte_size NULL` = poids inconnu. L'écran écrit « non mesuré », jamais
 *    « 0 KB », qui se lirait « fichier vide » — un fait, et faux.
 *  · `download_url NULL` = la pièce est RÉFÉRENCÉE mais pas stockée par ce
 *    service. L'écran n'offre alors PAS de bouton de téléchargement. Un bouton
 *    qui ne télécharge rien est une donnée fictive sous forme d'affordance :
 *    on le découvre en réunion, devant le prospect. Ce dépôt n'a pas de
 *    stockage de fichiers branché sur ce domaine — la colonne existe pour le
 *    jour où il en aura un, et jusque-là elle DIT l'absence.
 */
export class ExpenseReportAttachments1790970000003 implements MigrationInterface {
  public name = 'ExpenseReportAttachments1790970000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_report_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        file_name text NOT NULL,
        content_type text,
        byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
        download_url text,
        retention_until date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS expense_report_attachments_report_idx
        ON expense_report_attachments (expense_report_id)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS expense_report_attachments_workspace_idx ON expense_report_attachments (workspace_id)`,
    )
    // « Ce qu'il faut encore garder » est la question d'une purge de rétention :
    // sans cet index, elle scannerait toutes les pièces de tous les espaces.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS expense_report_attachments_retention_idx ON expense_report_attachments (retention_until)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE expense_report_attachments IS
        'Justificatifs d''une note de frais (31/08/2026). retention_until est STOCKEE et non recalculee : ce qu''on oppose a un controle est la regle en vigueur AU MOMENT du depot. download_url NULL = piece referencee mais non stockee ici - l''ecran n''offre alors aucun telechargement.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_report_attachments`)
  }
}
