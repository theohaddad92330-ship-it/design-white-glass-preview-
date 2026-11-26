import { CreditLedgerRefundAnalysisOnce1796458341011 } from '../1796458341011-CreditLedgerRefundAnalysisOnce'

describe('CreditLedgerRefundAnalysisOnce1796458341011', () => {
  it("ajoute la colonne puis un index unique PARTIEL, sans toucher à l'historique", async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new CreditLedgerRefundAnalysisOnce1796458341011().up({ query } as never)

    const sql = query.mock.calls.map(c => String(c[0]).replace(/\s+/g, ' '))
    expect(sql[0]).toContain('ADD COLUMN IF NOT EXISTS refunds_ledger_id uuid')
    expect(sql[1]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_refund_analysis_once_idx')
    expect(sql[1]).toContain("WHERE kind = 'refund_analysis' AND refunds_ledger_id IS NOT NULL")
    expect(sql.join(' ')).not.toMatch(/UPDATE|DELETE/i)
  })
})
