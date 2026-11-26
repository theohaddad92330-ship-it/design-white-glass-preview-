import type { QueryRunner } from 'typeorm'
import { InvoicePayments1795999436817 } from '../1795999436817-InvoicePayments'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new InvoicePayments1795999436817().up(runner)
  return normalize(queries.join(' '))
}

// #2419.1 — l'objet PAYMENT, distinct de la facture, SANS statut propre (c72).
describe('InvoicePayments1795999436817', () => {
  it('crée la table bornée à l’espace, la facture rattachée NULLABLE (« à rapprocher »)', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS invoice_payments')
    expect(sql).toContain('workspace_id uuid NOT NULL')
    expect(sql).toContain('invoice_readiness_id uuid NULL REFERENCES invoice_readiness(id)')
    expect(sql).toContain('received_on date NOT NULL')
  })

  it('un paiement a un MONTANT strictement positif — jamais un zéro qui vaudrait « non mesuré »', async () => {
    const sql = await upSql()
    expect(sql).toContain('CONSTRAINT invoice_payments_amount_check CHECK (amount_cents > 0)')
  })

  it('AUCUNE colonne de statut : le cycle d’encaissement reste aux quatre valeurs (c72)', async () => {
    const sql = await upSql()
    expect(sql).not.toMatch(/\bstatus\b/)
  })

  it('la source est une liste FERMÉE, élargie AVANT le code qui l’écrit (GA-11/GA-12, c80)', async () => {
    const sql = await upSql()
    expect(sql).toContain("CONSTRAINT invoice_payments_source_check CHECK (source IN ('manual'))")
  })

  it('le rattachement et la note de crédit client portent QUI et QUAND, ensemble ou aucun (#2419.3, #2419.11)', async () => {
    const sql = await upSql()
    expect(sql).toContain(
      'CONSTRAINT invoice_payments_matched_check CHECK ((matched_at IS NULL) = (matched_by IS NULL))',
    )
    expect(sql).toContain(
      'CONSTRAINT invoice_payments_credit_note_check CHECK ((customer_credit_noted_at IS NULL) = (customer_credit_note IS NULL) AND (customer_credit_note IS NULL OR length(btrim(customer_credit_note)) > 0))',
    )
  })

  it('RATTRAPE l’existant : un encaissement déjà déclaré AVEC montant devient un paiement rattaché, jamais un montant inventé', async () => {
    const sql = await upSql()
    expect(sql).toContain(
      'INSERT INTO invoice_payments (workspace_id, invoice_readiness_id, amount_cents, received_on, source)',
    )
    expect(sql).toContain('WHERE ir.paid_at IS NOT NULL AND ir.paid_amount_cents > 0')
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_readiness_id = ir.id)')
  })

  it('RLS : lue par les membres de l’espace, jamais au-delà', async () => {
    const sql = await upSql()
    expect(sql).toContain('ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))',
    )
  })

  it('down retire la table', async () => {
    const { runner, queries } = createRunner()
    await new InvoicePayments1795999436817().down(runner)
    expect(normalize(queries.join(' '))).toContain('DROP TABLE IF EXISTS invoice_payments')
  })
})
