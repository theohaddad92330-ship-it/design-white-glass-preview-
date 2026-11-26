import { MissionOdooSalesService } from '../delivery/mission-odoo-sales.service'
import { DEMO_ODOO_SALES_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CARRIER, DEMO_DELIVERY_CLIENT, DEMO_ODOO_SALES } from './demo-dataset'

/**
 * #2561/#2562 — la section « Ventes dans Odoo » est REMPLIE en démonstration,
 * et ses quatre états y sont visibles. Lit le VRAI jeu (ventes fictives +
 * missions semées de la salle), pas le commentaire de `demo-coverage.ts`.
 */
describe('démo — les ventes Odoo de la salle (#2561/#2562)', () => {
  function build() {
    const connections = { findOne: jest.fn(), update: jest.fn() }
    const accounts = {
      find: jest.fn(async () => [
        { id: 'acc-sncf', company_name: DEMO_DELIVERY_CARRIER, status: 'active' },
        { id: 'acc-sg', company_name: 'Société Générale', status: 'active' },
      ]),
    }
    const missions = {
      find: jest.fn(async () =>
        DEMO_DELIVERY_CLIENT.missions.map((mission, index) => ({
          id: `m-${index}`,
          label: mission.label,
          account_id: 'acc-sncf',
          started_on: null,
          daily_rate: mission.daily_rate ?? null,
          odoo_sale_order_id: null,
        })),
      ),
    }
    return {
      service: new MissionOdooSalesService(connections as never, accounts as never, missions as never),
      connections,
    }
  }

  it('est classée SEEDÉE', () => {
    expect(DEMO_ODOO_SALES_COVERAGE.state).toBe('seede')
  })

  it('montre les quatre états — déjà une mission, deux à reprendre, un client sans compte', async () => {
    const { service, connections } = build()
    const result = await service.list('ws-demo', true)
    expect(connections.findOne).not.toHaveBeenCalled()
    if (result.status !== 'ok') throw new Error(`attendu ok, reçu ${result.status}`)
    expect(result.sales).toHaveLength(DEMO_ODOO_SALES.length)

    const byRef = new Map(result.sales.map(row => [row.reference, row]))
    expect(byRef.get('S00118')?.mission?.by).toBe('label')
    expect(byRef.get('S00124')?.draft).not.toBeNull()
    expect(byRef.get('S00131')?.account?.name).toBe('Société Générale')
    expect(byRef.get('S00131')?.draft?.dailyRate).toBe(850)
    expect(byRef.get('S00137')).toMatchObject({ account: null, accountIssue: 'not_found', draft: null })
  })

  it('les dates sont RELATIVES — jamais une date en dur qui périmerait la salle', () => {
    for (const sale of DEMO_ODOO_SALES) {
      expect(JSON.stringify(sale)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})
