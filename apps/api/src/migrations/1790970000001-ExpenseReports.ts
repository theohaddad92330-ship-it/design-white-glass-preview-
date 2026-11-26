import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_reports` — la NOTE DE FRAIS, le dossier (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN REVIREMENT DATÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `PDF-22_Annexe_les-17-ecrans-cibles` §05 refusait ce domaine (« le domaine est
 * REFUSÉ. Le motif d'écran est repris. »). Louis a lu ce refus et l'a LEVÉ le
 * 31/08/2026 : le domaine complet est livré, avec les quatre pièces que le
 * refus nommait — barème par client, TVA récupérable, conservation des
 * justificatifs, politique paramétrable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TABLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS `mission_expenses` (1790900000003), qui est la LIGNE DE FRAIS
 * d'une mission — une colonne de coût qui corrige la marge. Une note de frais
 * est un DOSSIER : une personne, une période, des justificatifs, un circuit de
 * validation. Ce n'est pas non plus `supplier_invoices` (1790900000004), qui
 * est ce qu'on doit à une SOCIÉTÉ ; ici, on rembourse une PERSONNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE LIEN AVEC LA MARGE — `mission_expense_id`, et pourquoi il est ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Une note VALIDÉE qui porte une mission engendre UNE ligne `mission_expenses`,
 * et cette colonne en garde l'identifiant. C'est ce qui rend la validation
 * IDEMPOTENTE : le service refuse d'écrire une seconde ligne quand elle est
 * déjà renseignée. Sans elle, deux clics sur « Valider » — ou une reprise après
 * un timeout, qui est le cas réel — compteraient les frais DEUX FOIS dans la
 * marge de la mission ; et sans le lien du tout, ils y compteraient ZÉRO fois.
 * `ON DELETE SET NULL` : effacer la ligne de coût ne doit pas emporter la note,
 * qui reste la pièce du dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CONTRAINTES, POSÉES AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `status` — trois valeurs, celles que l'écran sait rendre. Un `draft` que
 *    rien n'écrirait serait du code que personne n'appelle ; GA-08 permettra de
 *    l'AJOUTER en fin de liste le jour où un chemin de brouillon existe.
 *  · `expense_reports_rejection_reason_check` — le DERNIER rempart du motif de
 *    refus, celui qu'aucun appelant ne contourne. Exactement le motif de
 *    `mission_timesheets_rejection_reason_check` : le schéma zod refuse un
 *    corps sans motif, le service refuse trois espaces, la base refuse un rejet
 *    sans motif. Trois remparts, parce que les deux premiers vivent dans du
 *    code qu'on peut appeler autrement.
 *  · `period_month` — `AAAA-MM` vérifié en base. Une période libre rendrait
 *    « mai 2026 » et « 2026-05 » incomparables, donc le filtre de mois faux.
 */
export class ExpenseReports1790970000001 implements MigrationInterface {
  public name = 'ExpenseReports1790970000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
        account_id uuid,
        bearer_name text NOT NULL,
        bearer_user_id uuid,
        reference text NOT NULL,
        period_month text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        submitted_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        decided_by uuid,
        rejection_reason text,
        mission_expense_id uuid REFERENCES mission_expenses(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT expense_reports_status_check CHECK (status IN ('pending', 'validated', 'rejected')),
        CONSTRAINT expense_reports_period_month_check CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
        CONSTRAINT expense_reports_rejection_reason_check
          CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> ''))
      )
    `)
    // La lecture de l'écran : « les notes de CET espace, pour CE mois, de la
    // plus récente ». Sans cet index, le filtre de mois scanne la table.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS expense_reports_workspace_period_idx
        ON expense_reports (workspace_id, period_month DESC, submitted_at DESC)
    `)
    // La fiche mission lit « les notes de CETTE mission ».
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS expense_reports_mission_idx ON expense_reports (mission_id)`)
    // Une référence ne se répète pas DANS un espace : deux notes « F-2026-006 »
    // rendraient la recherche par référence ambiguë, et le rapprochement
    // comptable impossible. Unique par ESPACE, pas globalement — deux ESN
    // numérotent légitimement pareil.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_reports_workspace_reference_key
        ON expense_reports (workspace_id, reference)
    `)
    await queryRunner.query(`
      COMMENT ON TABLE expense_reports IS
        'Notes de frais - le DOSSIER soumis par une personne pour une periode (31/08/2026). Distinct de mission_expenses (ligne de cout d''une mission) et de supplier_invoices (facture entrante d''une societe). Une note VALIDEE engendre UNE ligne mission_expenses, tracee par mission_expense_id : c''est ce qui empeche la marge de compter les frais deux fois.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_reports`)
  }
}
