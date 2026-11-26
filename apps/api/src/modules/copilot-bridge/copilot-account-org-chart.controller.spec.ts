import { failure, success } from '@bellum/utils'
import { CopilotAccountOrgChartController } from './copilot-account-org-chart.controller'

const USER = '99999999-9999-4999-8999-999999999999'
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('CopilotAccountOrgChartController (LOT 15/10 DATA-B.4)', () => {
  it('revérifie l’ownership : un compte étranger ne donne jamais de carte', async () => {
    const accounts = { findOne: jest.fn(async () => failure({ code: 'not_found', message: 'nope' })) }
    const contacts = { findByAccountForHttp: jest.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountOrgChartController(accounts as any, contacts as any)
    expect(await controller.orgChart({ userId: USER, accountId: ACCOUNT })).toEqual({ error: 'account_not_found' })
    expect(accounts.findOne).toHaveBeenCalledWith(ACCOUNT, USER)
    expect(contacts.findByAccountForHttp).not.toHaveBeenCalled()
  })

  it('sans graphe stocké, le dit', async () => {
    const accounts = { findOne: jest.fn(async () => success({ id: ACCOUNT, raw_analysis: {} })) }
    const contacts = { findByAccountForHttp: jest.fn(async () => []) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountOrgChartController(accounts as any, contacts as any)
    expect(await controller.orgChart({ userId: USER, accountId: ACCOUNT })).toEqual({ status: 'no_graph' })
  })

  it('retire les personnes dont le contact est écarté', async () => {
    const source = { id: 's1', kind: 'official_site', grounding: 'A' }
    const org = {
      orgGraph: {
        graphVersion: 1,
        entities: [{ id: 'e1', name: 'ACME', type: 'groupe', sources: [source], confidence: 90 }],
        people: [
          {
            id: 'p1',
            fullName: 'Claire Dubois',
            entityId: 'e1',
            decisionRoles: [],
            identityStatus: 'classified',
            sources: [source],
            confidence: 80,
          },
          {
            id: 'p2',
            fullName: 'Éric Martin',
            entityId: 'e1',
            decisionRoles: [],
            identityStatus: 'classified',
            sources: [source],
            confidence: 70,
          },
        ],
      },
    }
    const accounts = { findOne: jest.fn(async () => success({ id: ACCOUNT, raw_analysis: { org } })) }
    const contacts = {
      findByAccountForHttp: jest.fn(async () => [
        { full_name: 'Claire Dubois', excluded_at: new Date() },
        { full_name: 'Éric Martin', excluded_at: null },
      ]),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountOrgChartController(accounts as any, contacts as any)
    const out = await controller.orgChart({ userId: USER, accountId: ACCOUNT })
    expect('people' in out && out.people.map(p => p.full_name)).toEqual(['Éric Martin'])
  })
})
