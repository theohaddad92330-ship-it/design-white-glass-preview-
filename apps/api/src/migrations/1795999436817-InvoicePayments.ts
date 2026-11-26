import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2419.1 — l'objet PAYMENT, distinct de la facture.
 *
 * Tranché par Louis 22/09 soir (decisions §1) — reco appliquée : une table
 * `invoice_payments` SANS statut propre. Le cycle d'encaissement reste aux
 * quatre valeurs de `collections.ts` (c72, « aucun cinquième statut ») : un
 * paiement n'a pas d'état, il a un montant, une date, et — ou non — une
 * facture à laquelle un HUMAIN l'a rattaché.
 *
 *  - `invoice_readiness_id NULL` = « à rapprocher » (#2419.3). Bellum ne
 *    rattache JAMAIS seul : il propose des factures candidates, le geste
 *    humain rattache (même esprit que « on PROPOSE une fusion, on ne fusionne
 *    jamais »). `matched_at`/`matched_by` portent QUI et QUAND.
 *  - la somme des paiements rattachés devient `paid_amount_cents` de la ligne ;
 *    une somme SUPÉRIEURE au facturé est un double paiement SIGNALÉ (#2419.5),
 *    jamais remboursé automatiquement.
 *  - `customer_credit_note` (#2419.11) : une NOTE INTERNE — Bellum se souvient
 *    qu'un crédit est dû au client. Jamais un avoir émis, jamais une écriture
 *    comptable (« BellumAI SUIT le financier, il ne COMPTABILISE pas », c80).
 *  - `source` : liste fermée, `manual` seul aujourd'hui — élargie ICI avant le
 *    code qui écrira une autre source (GA-11/GA-12).
 */
export class InvoicePayments1795999436817 implements MigrationInterface {
  public name = 'InvoicePayments1795999436817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        invoice_readiness_id uuid NULL REFERENCES invoice_readiness(id),
        amount_cents bigint NOT NULL,
        received_on date NOT NULL,
        payer text NULL,
        reference text NULL,
        source text NOT NULL DEFAULT 'manual',
        recorded_by uuid NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        matched_at timestamptz NULL,
        matched_by uuid NULL,
        customer_credit_noted_at timestamptz NULL,
        customer_credit_note text NULL,
        customer_credit_noted_by uuid NULL,
        CONSTRAINT invoice_payments_amount_check CHECK (amount_cents > 0),
        CONSTRAINT invoice_payments_source_check CHECK (source IN ('manual')),
        CONSTRAINT invoice_payments_reference_check CHECK (reference IS NULL OR char_length(reference) BETWEEN 1 AND 200),
        CONSTRAINT invoice_payments_payer_check CHECK (payer IS NULL OR char_length(payer) BETWEEN 1 AND 200),
        CONSTRAINT invoice_payments_matched_check CHECK ((matched_at IS NULL) = (matched_by IS NULL)),
        CONSTRAINT invoice_payments_credit_note_check CHECK ((customer_credit_noted_at IS NULL) = (customer_credit_note IS NULL) AND (customer_credit_note IS NULL OR length(btrim(customer_credit_note)) > 0))
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
        ON invoice_payments (invoice_readiness_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_unmatched
        ON invoice_payments (workspace_id, received_on DESC) WHERE invoice_readiness_id IS NULL;
      ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "invoice_payments_workspace_read" ON invoice_payments;
      CREATE POLICY "invoice_payments_workspace_read" ON invoice_payments FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
    // Le RATTRAPAGE de l'existant : chaque encaissement déjà DÉCLARÉ avec son
    // montant devient un paiement rattaché. Sans lui, le premier paiement
    // saisi après le déploiement remplacerait la somme par sa seule valeur, et
    // un règlement partiel déjà connu disparaîtrait. Un encaissement sans
    // montant (`paid_amount_cents NULL`, « non mesuré ») n'en produit AUCUN :
    // on n'invente pas un montant.
    await queryRunner.query(`
      INSERT INTO invoice_payments (workspace_id, invoice_readiness_id, amount_cents, received_on, source)
      SELECT ir.workspace_id, ir.id, ir.paid_amount_cents, ir.paid_at::date, 'manual'
        FROM invoice_readiness ir
       WHERE ir.paid_at IS NOT NULL AND ir.paid_amount_cents > 0
         AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_readiness_id = ir.id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_payments`)
  }
}
