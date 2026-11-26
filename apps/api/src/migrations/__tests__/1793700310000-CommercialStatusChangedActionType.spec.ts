import type { QueryRunner } from 'typeorm'
import { CommercialStatusChangedActionType1793700310000 } from '../1793700310000-CommercialStatusChangedActionType'

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

describe('CommercialStatusChangedActionType1793700310000', () => {
  // #2117.24 — chaque changement de statut commercial écrit une entrée au
  // journal. Le CHECK s'élargit AVANT le code qui écrit la valeur (GA-11/12) :
  // l'écriture est best-effort, un rejet Postgres serait avalé par le `catch`.
  it('autorise la trace d’un changement de statut commercial', async () => {
    const { runner, queries } = createRunner()
    await new CommercialStatusChangedActionType1793700310000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check')
    const add = flat.find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    expect(add).toBeDefined()
    expect(add).toContain("'commercial_status_changed'")
  })

  it('n’en retire aucune : toutes les valeurs de la contrainte précédente restent autorisées (GA-08)', async () => {
    const { runner, queries } = createRunner()
    await new CommercialStatusChangedActionType1793700310000().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    for (const previous of ['deal_signed', 'account_score_changed', 'need_play_generated']) {
      expect(add).toContain(`'${previous}'`)
    }
  })
})
