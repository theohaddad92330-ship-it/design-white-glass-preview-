import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `supplier_invoices` — la facture ENTRANTE d'un sous-traitant (30/08/2026),
 * distincte de la facturation CLIENT (`invoice_readiness`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `supplier_invoice` / `incoming_invoice` : zéro occurrence dans
 * `apps/api/src` et `packages/contracts/src` avant ce lot. Le canal
 * `subcontracting` existe sur `mission_commercial_terms` depuis le Delivery
 * OS, mais il ne porte pas de facture fournisseur : quand une mission passe
 * par un sous-traitant, rien n'enregistrait ce qu'on lui doit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN STATUT À PART — pas celui de `invoice_readiness`
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice_readiness.status` répond à « sommes-nous prêts à ÉMETTRE » (le
 * sens VENDRE). Une facture fournisseur répond à l'inverse : « devons-nous
 * PAYER » (le sens ACHETER). Deux notions opposées ne partagent pas un enum —
 * la contrainte ci-dessous est donc NOMMÉE `supplier_invoices_status_check`
 * et couvre `SUPPLIER_INVOICE_STATUSES`, jamais les valeurs de la facturation
 * client.
 *
 * Même motif que `mission_expenses` pour le reste : `source` reprend
 * `FIELD_SOURCES` (`human` > `connector` > `pipeline` > `model`), et
 * `amount_cents bigint NOT NULL CHECK (amount_cents > 0)` est posée AVANT le
 * code qui écrit (GA-11/GA-12).
 */
export class SupplierInvoices1790900000004 implements MigrationInterface {
  public name = 'SupplierInvoices1790900000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        reference text NOT NULL,
        amount_cents bigint NOT NULL CHECK (amount_cents > 0),
        invoice_date date NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        entered_by uuid NOT NULL,
        source text NOT NULL DEFAULT 'human',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT supplier_invoices_status_check CHECK (status IN ('pending', 'validated', 'paid', 'disputed')),
        CONSTRAINT supplier_invoices_source_check CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS supplier_invoices_mission_idx
        ON supplier_invoices (mission_id, invoice_date DESC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS supplier_invoices_workspace_idx ON supplier_invoices (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE supplier_invoices IS
        'Factures ENTRANTES d''un sous-traitant (30/08/2026) - distinctes de invoice_readiness (facturation CLIENT). Entrent dans le cout de la mission via missionMarginWithExpenses (@bellum/contracts). Reservees a finance:read (lecture/saisie) et finance:write (changement de statut).'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_invoices`)
  }
}
