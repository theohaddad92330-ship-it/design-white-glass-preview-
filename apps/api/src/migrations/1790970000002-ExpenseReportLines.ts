import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_report_lines` — le « Détail des frais » du tiroir (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `vat_rate_bps` NULLABLE, ET C'EST LA DÉCISION DE CETTE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le taux de TVA est stocké en POINTS DE BASE (2000 = 20 %) et il est
 * NULLABLE. `NULL` veut dire « le ticket n'a pas été lu », `0` veut dire « taux
 * zéro » — deux faits différents, et un défaut `0` les aurait confondus le
 * premier jour. La ventilation de TVA rend alors `null` pour la ligne et la
 * COMPTE dans `unmeasuredLineCount` : un total de TVA récupérable qui a l'air
 * complet alors qu'une ligne sur cinq n'a pas de taux est exactement le chiffre
 * qu'on oppose à un contrôle.
 *
 * Le montant RÉCUPÉRABLE n'est PAS stocké : il DÉRIVE du taux et de la
 * politique du client (`expense_policy_caps.vat_recoverable`). Une dérivation
 * vit à un seul endroit — `lineRecoverableVatCents` (@bellum/contracts). Stockée
 * ici, elle deviendrait fausse à la première correction du barème, sans que
 * rien ne le dise.
 *
 * `city` figure sur le justificatif et la maquette l'affiche. C'est l'exception
 * NOMMÉE de la doctrine sur les critères protégés (ville / pays, plus grossiers
 * que le code postal) : elle DÉCRIT une dépense, elle n'ordonne aucune personne
 * et n'entre dans aucun classement.
 *
 * `amount_cents bigint NOT NULL CHECK (amount_cents > 0)` : même contrainte que
 * `mission_expenses`, posée AVANT le code qui écrit (GA-11/GA-12). Une ligne à
 * 0 ne veut rien dire ; une ligne négative serait un remboursement, qui n'est
 * pas une dépense.
 */
export class ExpenseReportLines1790970000002 implements MigrationInterface {
  public name = 'ExpenseReportLines1790970000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_report_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        category text NOT NULL,
        label text NOT NULL,
        spent_on date NOT NULL,
        city text,
        detail text,
        amount_cents bigint NOT NULL CHECK (amount_cents > 0),
        vat_rate_bps integer CHECK (vat_rate_bps IS NULL OR (vat_rate_bps >= 0 AND vat_rate_bps <= 10000)),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT expense_report_lines_category_check CHECK (category IN (
          'meal', 'hotel', 'train', 'plane', 'taxi', 'car_rental',
          'fuel', 'toll', 'parking', 'mileage', 'supplies', 'other'
        ))
      )
    `)
    // Le tiroir lit « les lignes de CETTE note, dans l'ordre où elles ont été
    // engagées ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS expense_report_lines_report_idx
        ON expense_report_lines (expense_report_id, spent_on)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS expense_report_lines_workspace_idx ON expense_report_lines (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE expense_report_lines IS
        'Lignes d''une note de frais (31/08/2026). vat_rate_bps est NULLABLE : NULL = taux non lu, 0 = taux zero - deux faits distincts. La TVA recuperable n''est pas stockee, elle DERIVE du taux et de expense_policy_caps.vat_recoverable via lineRecoverableVatCents (@bellum/contracts).'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_report_lines`)
  }
}
