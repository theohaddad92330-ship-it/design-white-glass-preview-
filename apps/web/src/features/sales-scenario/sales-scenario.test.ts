import { describe, expect, it } from 'vitest'
import { buildSalesScenarioSteps } from './sales-scenario'

// #2731.2 — le scénario part des données de l'espace, jamais d'un exemple.
describe('buildSalesScenarioSteps', () => {
  const account = { id: 'acc-9', name: 'Hexagone Assurances' }
  const contact = { id: 'ct-4', name: 'Claire Martin' }

  it('joue le fil complet sur le compte et l’interlocuteur RÉELS', () => {
    const steps = buildSalesScenarioSteps({ account, contact })
    expect(steps.map(step => step.key)).toEqual(['account', 'contact', 'message', 'actions', 'laura'])
    expect(steps[0]).toEqual({ key: 'account', route: '/accounts/acc-9', values: { account: 'Hexagone Assurances' } })
    expect(steps[1]?.route).toBe('/contacts/ct-4')
    expect(steps[2]?.values).toEqual({ account: 'Hexagone Assurances', contact: 'Claire Martin' })
  })

  it('SAIT DIRE NON — sans interlocuteur, aucune étape ne pointe vers un contact deviné', () => {
    const steps = buildSalesScenarioSteps({ account, contact: null })
    expect(steps.map(step => step.key)).toEqual(['account', 'actions', 'laura'])
    expect(steps.some(step => step.route.startsWith('/contacts/'))).toBe(false)
  })

  it('SAIT DIRE NON — sans compte analysé, le scénario commence par en analyser un, et s’arrête là', () => {
    expect(buildSalesScenarioSteps({ account: null, contact })).toEqual([
      { key: 'search', route: '/search', values: {} },
    ])
  })
})
