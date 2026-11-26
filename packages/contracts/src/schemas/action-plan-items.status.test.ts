import { describe, expect, it } from 'vitest'
import { actionExecutionStatusSchema, updateActionPlanItemSchema } from './action-plan-items.js'

/**
 * #2123.37 / #2123.41 — les statuts d'une action du plan.
 *
 * Recette du 15/09 : « Préparée » et « Exécutée » n'existaient que dans le
 * copilote et les routines, aucun statut d'action du PLAN ne les portait.
 */
describe('#2123.37 — actionExecutionStatusSchema', () => {
  it('ajoute « prepared » EN FIN, sans retirer ni insérer au milieu (GA-08)', () => {
    expect(actionExecutionStatusSchema.options).toEqual(['todo', 'done', 'snoozed', 'prepared', 'obsolete'])
  })

  it('accepte « prepared » dans le corps de mise à jour', () => {
    expect(updateActionPlanItemSchema.parse({ execution_status: 'prepared' })).toEqual({
      execution_status: 'prepared',
    })
  })

  it('#2123.41 — « Exécutée » est le LIBELLÉ de done, pas une seconde valeur du même état', () => {
    expect(actionExecutionStatusSchema.safeParse('executed').success).toBe(false)
  })
})
