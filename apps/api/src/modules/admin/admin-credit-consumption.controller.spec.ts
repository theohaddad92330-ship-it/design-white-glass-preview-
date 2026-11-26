import { AdminCreditConsumptionController } from './admin-credit-consumption.controller'
import type { AdminCreditConsumptionService } from './admin-credit-consumption.service'

// #4467 — le contrôleur lit l'horloge, normalise la recherche et la fenêtre.

type Query = { search?: string; days?: number; now: Date }

function monter(): { controller: AdminCreditConsumptionController; appels: Query[] } {
  const appels: Query[] = []
  const service = {
    report: async (query: Query) => {
      appels.push(query)
      return { windowDays: 30, workspaces: [], users: [], exhausted: [] }
    },
  } as unknown as AdminCreditConsumptionService
  return { controller: new AdminCreditConsumptionController(service), appels }
}

describe('GET internal/admin/credit-consumption', () => {
  it('passe une horloge au service', async () => {
    const { controller, appels } = monter()
    await controller.report()
    expect(appels[0]?.now).toBeInstanceOf(Date)
  })

  it('une recherche vide ou blanche vaut « pas de filtre »', async () => {
    const { controller, appels } = monter()
    await controller.report('   ')
    expect(appels[0]?.search).toBeUndefined()
    await controller.report(' acme ')
    expect(appels[1]?.search).toBe('acme')
  })

  it('transmet la fenêtre en jours, absente quand elle n’est pas demandée', async () => {
    const { controller, appels } = monter()
    await controller.report(undefined, '')
    await controller.report(undefined, '7')
    expect(appels[0]?.days).toBeUndefined()
    expect(appels[1]?.days).toBe(7)
  })
})
