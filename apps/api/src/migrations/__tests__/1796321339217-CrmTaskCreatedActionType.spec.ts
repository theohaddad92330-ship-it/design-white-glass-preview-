import type { QueryRunner } from 'typeorm'
import { actionTypeSchema } from '@bellum/contracts'
import { CrmTaskCreatedActionType1796321339217 } from '../1796321339217-CrmTaskCreatedActionType'

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

describe('CrmTaskCreatedActionType1796321339217', () => {
  // #2277.36 (épopée #2771) — `dispatchCrmTask` journalisait déjà sous
  // `crm_task_created` (lot #1931) sans que Postgres ne l'ait jamais autorisé :
  // chaque écriture était rejetée et avalée en silence par le `catch`
  // best-effort de `journal()`.
  it('autorise la trace d’une tâche CRM créée depuis le routeur d’actions', async () => {
    const { runner, queries } = createRunner()
    await new CrmTaskCreatedActionType1796321339217().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check')
    const add = flat.find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    expect(add).toBeDefined()
    expect(add).toContain("'crm_task_created'")
  })

  it('n’en retire aucune : toutes les valeurs de la contrainte précédente restent autorisées (GA-08)', async () => {
    const { runner, queries } = createRunner()
    await new CrmTaskCreatedActionType1796321339217().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    for (const previous of ['commercial_status_changed', 'deal_signed', 'need_play_generated']) {
      expect(add).toContain(`'${previous}'`)
    }
  })

  /**
   * La garde de parité vit sur la migration qui définit ACTUELLEMENT la
   * contrainte — elle déménage ici depuis `CommercialStatusChangedActionType`.
   */
  it('le CHECK reste synchronisé avec le contrat zod (aucune valeur oubliée)', async () => {
    const { runner, queries } = createRunner()
    await new CrmTaskCreatedActionType1796321339217().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    expect(actionTypeSchema.options.length).toBeGreaterThan(0)
    for (const type of actionTypeSchema.options) {
      expect(add).toContain(`'${type}'`)
    }
  })
})
