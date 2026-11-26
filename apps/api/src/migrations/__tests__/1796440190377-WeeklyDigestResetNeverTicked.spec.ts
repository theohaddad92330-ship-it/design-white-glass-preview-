import type { QueryRunner } from 'typeorm'
import { WeeklyDigestResetNeverTicked1796440190377 } from '../1796440190377-WeeklyDigestResetNeverTicked'

async function upSql(migrationsTable: string | null = '_migrations'): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      if (/to_regclass/.test(sql)) return [{ t: migrationsTable }]
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new WeeklyDigestResetNeverTicked1796440190377().up(runner)
  return queries.join('\n')
}

// #4016 L12 — la preuve sur lignes réelles est dans le `.db.spec.ts` voisin.
describe('WeeklyDigestResetNeverTicked1796440190377 (forme)', () => {
  it('ne fait que remettre à `false` et tracer — jamais de DELETE, jamais de contrainte (GA-11/12)', async () => {
    const sql = await upSql()
    expect(sql).toMatch(/UPDATE notification_preferences/)
    expect(sql).toMatch(/SET weekly_digest = false/)
    expect(sql).toMatch(/weekly_digest_swept_at = now\(\)/)
    expect(sql).not.toMatch(/\bDELETE\b|DROP |ADD CONSTRAINT/i)
  })

  it('ne remet à zéro que des lignes à `true`, intactes depuis leur création, pas déjà balayées', async () => {
    const sql = await upSql()
    expect(sql).toMatch(/weekly_digest = true/)
    expect(sql).toMatch(/updated_at = created_at/)
    expect(sql).toMatch(/weekly_digest_swept_at IS NULL/)
  })

  it('lit la date de `WeeklyDigestPreference` dans `_migrations` quand la table existe', async () => {
    expect(await upSql('_migrations')).toMatch(/FROM _migrations m/)
  })

  // Base neuve sans `_migrations` (job CI « Démo (semis sur vraie base) », 12/10) : citer la
  // table faisait échouer TOUTE la migration — la clause (B) ne s'applique pas, fail closed.
  it('sans table `_migrations`, ne la cite pas et ne garde que le critère (A)', async () => {
    const sql = await upSql(null)
    expect(sql).not.toMatch(/_migrations/)
    expect(sql).toMatch(/newsletter_last_entry_id IS NOT NULL/)
    expect(sql).toMatch(/updated_at = created_at/)
  })
})
