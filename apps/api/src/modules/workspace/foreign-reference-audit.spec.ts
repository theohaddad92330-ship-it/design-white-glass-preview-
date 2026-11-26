import {
  FOREIGN_REFERENCE_CHECKS,
  formatForeignReferenceReport,
  runForeignReferenceAudit,
  type ForeignReferencePort,
} from './foreign-reference-audit'

/**
 * #4559 — les lignes DÉJÀ écrites avant la garde d'écriture se SIGNALENT, elles
 * ne s'effacent pas et ne se réécrivent pas. Le signalement est une lecture :
 * des comptes, jamais un identifiant (ni dans le rapport, ni dans un journal).
 */
describe('#4559 — signalement des identifiants étrangers déjà stockés', () => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  it('couvre les trois colonnes des six cas (manager, affaire, besoin)', () => {
    expect(FOREIGN_REFERENCE_CHECKS.map(check => check.key)).toEqual([
      'consultants.manager_id',
      'missions.opportunity_id',
      'missions.need_id',
    ])
  })

  it('n’émet que des lectures : aucune écriture, aucune suppression', () => {
    for (const { sql } of FOREIGN_REFERENCE_CHECKS) {
      expect(sql.trim()).toMatch(/^SELECT\b/i)
      expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE|ALTER|DROP)\b/i)
    }
  })

  it('compare l’espace de la cible à celui de la ligne (IS DISTINCT FROM)', () => {
    for (const { sql } of FOREIGN_REFERENCE_CHECKS) expect(sql).toMatch(/IS DISTINCT FROM/)
  })

  it('rend des COMPTES par cas, et le rapport ne porte aucun identifiant', async () => {
    const port: ForeignReferencePort = {
      count: jest.fn(async (sql: string) =>
        sql.includes('c.manager_id') ? { rows: 4, workspaces: 2 } : { rows: 0, workspaces: 0 },
      ),
    }
    const report = await runForeignReferenceAudit(port)
    expect(report).toEqual([
      { key: 'consultants.manager_id', rows: 4, workspaces: 2 },
      { key: 'missions.opportunity_id', rows: 0, workspaces: 0 },
      { key: 'missions.need_id', rows: 0, workspaces: 0 },
    ])
    const text = formatForeignReferenceReport(report)
    expect(text).toContain('consultants.manager_id : 4 ligne(s) dans 2 espace(s)')
    expect(text).not.toMatch(UUID)
  })
})
