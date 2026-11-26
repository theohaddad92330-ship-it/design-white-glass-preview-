import { LegalContractController } from './legal-contract.controller'

const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTRACT = 'c0000000-0000-4000-8000-000000000001'

function make(role: string, extra: string[] = []) {
  const contracts = { list: jest.fn(async () => []), addDocument: jest.fn(async () => ({})) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role })),
    extraPermissionsOf: jest.fn(async () => extra),
  }
  const controller = new LegalContractController(contracts as never, workspaceContext as never)
  return { controller, contracts }
}

describe('LegalContractController — #2422.10 le lecteur décide des pièces rendues', () => {
  it('un membre sans finance:read lit avec canReadFinance = false', async () => {
    const { controller, contracts } = make('viewer')
    await controller.list({ userId: USER } as never, ACCOUNT)
    expect(contracts.list).toHaveBeenCalledWith('ws-1', ACCOUNT, { userId: USER, canReadFinance: false })
  })

  it('un propriétaire d’espace lit avec canReadFinance = true', async () => {
    const { controller, contracts } = make('owner')
    await controller.list({ userId: USER } as never, ACCOUNT)
    expect(contracts.list).toHaveBeenCalledWith('ws-1', ACCOUNT, { userId: USER, canReadFinance: true })
  })

  it('déposer une pièce transmet le lecteur : la réponse est filtrée comme la liste', async () => {
    const { controller, contracts } = make('viewer', ['finance:read'])
    const body = { label: 'X', url: null, signedAt: null, expiresOn: null, visibility: 'finance' as const }
    await controller.addDocument({ userId: USER } as never, ACCOUNT, CONTRACT, body as never)
    expect(contracts.addDocument).toHaveBeenCalledWith('ws-1', ACCOUNT, CONTRACT, body, {
      userId: USER,
      canReadFinance: true,
    })
  })
})
