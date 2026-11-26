import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2563 / #2566 / #2567 — la facture reconduite d'une mission longue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_month_preparations` — le mois PRÉPARÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une mission longue refacture chaque mois la même chose : seuls le nombre de
 * jours et parfois le N° de bon de commande changent. Une ligne par (mission,
 * mois) retient CE qu'un humain a validé pour ce mois :
 *   - `manual_days` : les jours SAISIS faute de CRA (« jours saisis, sans CRA »).
 *     `null` = rien de saisi, jamais 0 ; ne remplace JAMAIS un relevé déposé.
 *   - `po_number` : le N° de bon de commande de CE mois seul. `null` = on
 *     reprend celui de la mission (`mission_commercial_terms.po_number`).
 *
 * Table à part et non colonnes de plus sur `invoice_readiness` : cette dernière
 * est comptée par ligne (`chain-projectors`, `first-euro`) comme « un mois
 * facturé ou en cours » ; y poser une préparation ferait compter un mois non
 * facturé. « Préparée » ≠ « créée » ≠ « envoyée » ≠ « facturée ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_invoice_auto_prepare` — l'option « préparer chaque mois »
 * ─────────────────────────────────────────────────────────────────────────────
 * Présence d'une ligne = l'option est active. Le premier jour ouvré, le
 * brouillon du mois est PRÉPARÉ (jamais envoyé, jamais créé dans l'outil
 * branché). Purement additif : le retirer ne casse rien.
 */
export class MissionMonthPreparations1796437418463 implements MigrationInterface {
  public name = 'MissionMonthPreparations1796437418463'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_month_preparations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        period_month date NOT NULL,
        manual_days numeric NULL CHECK (manual_days IS NULL OR manual_days >= 0),
        po_number text NULL,
        prepared_by uuid NULL,
        prepared_automatically boolean NOT NULL DEFAULT false,
        prepared_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_month_preparations_unique UNIQUE (mission_id, period_month)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_month_preparations_workspace_idx ON mission_month_preparations (workspace_id)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_invoice_auto_prepare (
        mission_id uuid PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        enabled_by uuid NULL,
        enabled_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_invoice_auto_prepare_workspace_idx ON mission_invoice_auto_prepare (workspace_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_invoice_auto_prepare`)
    await queryRunner.query(`DROP TABLE IF EXISTS mission_month_preparations`)
  }
}
