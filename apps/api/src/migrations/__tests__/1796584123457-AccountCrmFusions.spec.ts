import type { QueryRunner } from 'typeorm'
import { AccountCrmFusions1796584123457 } from '../1796584123457-AccountCrmFusions'

function createRunner(): { runner: QueryRunner; sql: () => string } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (q: string) => {
      queries.push(q)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, sql: () => queries.join(' ').replace(/\s+/g, ' ').trim() }
}

// #4603 — le JOURNAL de la fusion compte-CRM ↔ compte-analyse, posé AVANT le code qui l'écrit (GA-11/12).
describe('AccountCrmFusions1796584123457', () => {
  it('crée le journal : les deux identifiants, la clé qui a décidé, ce qui a bougé, l’annulation', async () => {
    const { runner, sql } = createRunner()
    await new AccountCrmFusions1796584123457().up(runner)
    expect(sql()).toContain('CREATE TABLE IF NOT EXISTS account_crm_fusions')
    for (const column of [
      'workspace_id uuid NOT NULL',
      'kept_id uuid NOT NULL',
      'absorbed_id uuid NOT NULL',
      'basis text NOT NULL',
      'match_key text NOT NULL',
      "moved jsonb NOT NULL DEFAULT '{}'::jsonb",
      'undone_at timestamptz',
      'undone_by uuid',
    ]) {
      expect(sql()).toContain(column)
    }
  })

  it('borne ce qu’il écrit : clé SIREN ou nom, jamais une fiche fusionnée en elle-même, clé non vide', async () => {
    const { runner, sql } = createRunner()
    await new AccountCrmFusions1796584123457().up(runner)
    expect(sql()).toContain("CHECK (basis IN ('siren', 'name'))")
    expect(sql()).toContain('CHECK (kept_id <> absorbed_id)')
    expect(sql()).toContain("CHECK (jsonb_typeof(moved) = 'object')")
    expect(sql()).toContain('CHECK (length(btrim(match_key)) > 0)')
  })

  it('une fiche n’est absorbée qu’UNE fois tant que la fusion tient — l’annulation la libère', async () => {
    const { runner, sql } = createRunner()
    await new AccountCrmFusions1796584123457().up(runner)
    expect(sql()).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS account_crm_fusions_live_absorbed_uidx ON account_crm_fusions (workspace_id, absorbed_id) WHERE undone_at IS NULL',
    )
  })

  it('est additive : aucune table existante n’est modifiée, et RLS fermée au client', async () => {
    const { runner, sql } = createRunner()
    await new AccountCrmFusions1796584123457().up(runner)
    expect(sql()).not.toMatch(/ALTER TABLE (accounts|contacts|duplicate_pairs)\b/)
    expect(sql()).not.toMatch(/\b(DELETE|DROP TABLE|UPDATE)\b/)
    expect(sql()).toContain('ALTER TABLE account_crm_fusions ENABLE ROW LEVEL SECURITY')
  })
})
