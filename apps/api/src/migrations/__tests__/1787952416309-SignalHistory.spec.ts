import type { QueryRunner } from 'typeorm'
import { SignalHistory1787952416309 } from '../1787952416309-SignalHistory'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

describe('SignalHistory1787952416309', () => {
  it('creates the signal_history table with the lifecycle CHECK and FK CASCADE', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistory1787952416309().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS signal_history'))
    expect(create).toBeDefined()
    expect(create).toContain('account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE')
    expect(create).toContain("status text NOT NULL DEFAULT 'active'")
    expect(create).toContain("CHECK (status IN ('active', 'resolved'))")
    // Les quatre faits demandés (§11) : 1re détection, changements, fraîcheur, résolution.
    expect(create).toContain('first_detected_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('first_detection_exact boolean NOT NULL DEFAULT true')
    expect(create).toContain('last_seen_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('change_count integer NOT NULL DEFAULT 0')
    expect(create).toContain('resolved_at timestamptz')
  })

  it('creates a unique index for idempotent re-materialization (account, md5(signal_key))', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistory1787952416309().up(runner)
    const uniq = queries.map(normalize).find(q => q.includes('signal_history_account_key_uniq'))
    expect(uniq).toBeDefined()
    expect(uniq).toContain('UNIQUE INDEX')
    expect(uniq).toContain('ON signal_history (account_id, md5(signal_key))')
  })

  it('enables workspace-scoped RLS (defence in depth), like the other métier tables', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistory1787952416309().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY')
    const policy = flat.find(q => q.includes('CREATE POLICY') && q.includes('signal_history'))
    expect(policy).toBeDefined()
    expect(policy).toContain('FOR SELECT')
    expect(policy).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('backfills from the existing blobs without inventing a first-detection date', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistory1787952416309().up(runner)
    const inserts = queries.map(normalize).filter(q => q.includes('INSERT INTO signal_history'))
    expect(inserts).toHaveLength(1)
    const insert = inserts[0] as string
    // Re-run sûr, et deux libellés identiques dans un même blob = une seule ligne.
    expect(insert).toContain('ON CONFLICT (account_id, md5(signal_key)) DO NOTHING')
    // La date de 1re détection d'un signal déjà en base est INCONNUE : on ancre
    // sur un timestamp RÉEL du compte et on marque l'imprécision. Jamais `now()`.
    expect(insert).toContain('COALESCE(a.updated_at, a.created_at)')
    expect(insert).not.toContain('now()')
    expect(insert).toContain('false')
    // Même ordre de lecture du libellé que le diff de la veille.
    expect(insert).toContain("COALESCE(s->>'signal', s->>'title', s->>'label', s->>'description', s->>'summary')")
    expect(insert).toContain("a.status <> 'deleted'")
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new SignalHistory1787952416309().down()).rejects.toThrow('down migrations are not supported')
  })
})
