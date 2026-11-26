import type { QueryRunner } from 'typeorm'
import { CommercialAuditFeedback1796322160100 } from '../1796322160100-CommercialAuditFeedback'

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

describe('CommercialAuditFeedback1796322160100', () => {
  it('crée la table, `kind` bornée à comment/refused (#2075.12 / #2075.13)', async () => {
    const { runner, queries } = createRunner()
    await new CommercialAuditFeedback1796322160100().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS commercial_audit_feedback')
    // GA-177 — un CHECK reste NOMMÉ, jamais écrit en ligne dans la colonne.
    expect(sql).toContain('CONSTRAINT commercial_audit_feedback_kind_check')
    expect(sql).toContain("CHECK (kind IN ('comment', 'refused'))")
  })

  it("exige un texte pour un commentaire, jamais pour un refus — contrainte SQL, pas seulement l'API", async () => {
    const { runner, queries } = createRunner()
    await new CommercialAuditFeedback1796322160100().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("kind = 'comment' AND comment_text IS NOT NULL")
    expect(sql).toContain("kind = 'refused' AND comment_text IS NULL")
  })

  it('est rejouable — IF NOT EXISTS sur la table et l’index', async () => {
    const { runner, queries } = createRunner()
    await new CommercialAuditFeedback1796322160100().up(runner)
    const statements = normalize(queries.join(' '))
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS')
    expect(statements).toContain('CREATE INDEX IF NOT EXISTS')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new CommercialAuditFeedback1796322160100().down(runner)
    expect(normalize(queries.join(' '))).toContain('DROP TABLE IF EXISTS commercial_audit_feedback')
  })
})
