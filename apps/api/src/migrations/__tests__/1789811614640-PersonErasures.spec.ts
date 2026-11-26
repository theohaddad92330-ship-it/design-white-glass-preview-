import type { QueryRunner } from 'typeorm'
import { PersonErasures1789811614640 } from '../1789811614640-PersonErasures'

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

async function run(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new PersonErasures1789811614640().up(runner)
  return queries.map(normalize)
}

/**
 * #2297 — la trace d'un effacement de personne (RGPD art. 17). La migration
 * vient AVANT le code qui écrit (GA-11/12) : chaque colonne que
 * `PersonErasureService` écrit existe, et la base elle-même refuse qu'une
 * donnée personnelle EN CLAIR y entre — seules des empreintes hexadécimales.
 */
describe('PersonErasures1789811614640', () => {
  it('crée person_erasures : qui, quand, empreintes — aucune colonne de personne', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS person_erasures')) ?? ''
    expect(create).toContain('workspace_id uuid NOT NULL')
    expect(create).toContain('erased_by uuid NULL')
    expect(create).toContain('erased_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('fingerprints text[] NOT NULL')
    // Sait dire NON : aucune colonne qui porterait la personne elle-même.
    for (const column of ['full_name', 'email', 'phone', 'linkedin_url', 'contact_id', 'account_id', 'note']) {
      expect(create).not.toContain(column)
    }
  })

  it('la base refuse une empreinte qui ne serait pas un condensat SHA-256 hexadécimal', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS person_erasures')) ?? ''
    expect(create).toContain(
      "CONSTRAINT person_erasures_fingerprints_check CHECK (cardinality(fingerprints) >= 1 AND array_to_string(fingerprints, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$')",
    )
  })

  it('indexe la question posée à chaque collecte, et active la RLS', async () => {
    const queries = await run()
    expect(queries).toContain(
      'CREATE INDEX IF NOT EXISTS person_erasures_fingerprints_idx ON person_erasures USING gin (fingerprints)',
    )
    expect(queries).toContain(
      'CREATE INDEX IF NOT EXISTS person_erasures_workspace_idx ON person_erasures (workspace_id)',
    )
    expect(queries).toContain('ALTER TABLE person_erasures ENABLE ROW LEVEL SECURITY')
  })
})
