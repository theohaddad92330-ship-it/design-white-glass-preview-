import type { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import IORedis from 'ioredis'
import { failure, success } from '@bellum/utils'
import type { AccountsService } from '../accounts/accounts.service'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import type { BusinessUnitService } from '../business-unit/business-unit.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AnalysisGateway } from './analysis.gateway'

/** Un compte fictif pour les tests de périmètre — `businessUnitId: null` veut
 *  dire « sans unité assignée », visible de tout membre (règle 3 de
 *  `businessUnitScopeClause`). */
type FakeAccount = { id: string; businessUnitId: string | null }

/**
 * Une passerelle avec les TROIS dépendances qui répondent à « ce compte
 * est-il dans l'espace ET dans l'unité de l'appelant ? » (#2710). Sans
 * argument, elles sont absentes : le chemin de refus ne doit toucher aucune
 * des trois.
 *
 * `findOneForWorkspace` rejoue ici la même règle que
 * `AccountsService.findOneForWorkspace` (IN (...) OR IS NULL) — un mock qui
 * renverrait toujours `success` ne prouverait rien sur le périmètre d'unité.
 */
function makeGatewayWith(
  workspaceId?: string,
  accountsInWorkspace: readonly (string | FakeAccount)[] = [],
  businessUnitScope: BusinessUnitScopeClause = null,
): { gateway: AnalysisGateway; findOneForWorkspace: jest.Mock; scopeFor: jest.Mock } {
  const accounts: FakeAccount[] = accountsInWorkspace.map(a =>
    typeof a === 'string' ? { id: a, businessUnitId: null } : a,
  )
  const resolveActiveWorkspace = jest.fn(() =>
    workspaceId ? Promise.resolve({ workspaceId, role: 'owner' }) : Promise.reject(new Error('aucun espace')),
  )
  const scopeFor = jest.fn(() => Promise.resolve(businessUnitScope))
  const findOneForWorkspace = jest.fn((id: string, ws: string, scope: BusinessUnitScopeClause) => {
    if (ws !== workspaceId) return Promise.resolve(failure({ code: 'not_found' as const, message: 'introuvable' }))
    const account = accounts.find(a => a.id === id)
    if (!account) return Promise.resolve(failure({ code: 'not_found' as const, message: 'introuvable' }))
    if (scope && account.businessUnitId !== null && !scope.businessUnitIds.includes(account.businessUnitId)) {
      return Promise.resolve(failure({ code: 'not_found' as const, message: 'hors périmètre' }))
    }
    return Promise.resolve(success({ id: account.id }))
  })
  const gateway = new AnalysisGateway(
    { resolveActiveWorkspace } as unknown as WorkspaceContextService,
    { findOneForWorkspace } as unknown as AccountsService,
    { scopeFor } as unknown as BusinessUnitService,
  )
  return { gateway, findOneForWorkspace, scopeFor }
}

const makeClientSocket = (authenticatedUserId?: string) => ({
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  data: authenticatedUserId ? { user: { userId: authenticatedUserId, email: '' } } : {},
})

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => 'redis-adapter-instance'),
}))

jest.mock('ioredis', () => {
  const makeClient = () => ({
    duplicate: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  })
  const ctor = jest.fn(() => {
    const client = makeClient()
    client.duplicate.mockReturnValue(makeClient())
    return client
  })
  return { __esModule: true, default: ctor }
})

describe('AnalysisGateway', () => {
  let gateway: AnalysisGateway
  let mockEmit: jest.Mock
  let mockServer: { to: jest.Mock }

  beforeEach(() => {
    mockEmit = jest.fn()
    mockServer = { to: jest.fn().mockReturnValue({ emit: mockEmit }) }
    gateway = makeGatewayWith().gateway
    gateway.server = mockServer as unknown as Server
  })

  it('should emit phase:complete event with correct payload', () => {
    gateway.emitPhaseComplete('acc-1', 'job-1', 'research_complete', 40, { sector: 'Transport' })
    expect(mockServer.to).toHaveBeenCalledWith('acc-1')
    expect(mockEmit).toHaveBeenCalledWith('phase:complete', {
      accountId: 'acc-1',
      jobId: 'job-1',
      phase: 'research_complete',
      percent: 40,
      data: { sector: 'Transport' },
    })
  })

  it('should emit phase:complete without data', () => {
    gateway.emitPhaseComplete('acc-1', 'job-1', 'contacts_complete', 70)
    expect(mockEmit).toHaveBeenCalledWith('phase:complete', {
      accountId: 'acc-1',
      jobId: 'job-1',
      phase: 'contacts_complete',
      percent: 70,
      data: undefined,
    })
  })

  it('should emit analysis:done event', () => {
    gateway.emitAnalysisDone('acc-1', 'job-1')
    expect(mockServer.to).toHaveBeenCalledWith('acc-1')
    expect(mockEmit).toHaveBeenCalledWith('analysis:done', { accountId: 'acc-1', jobId: 'job-1', percent: 100 })
  })

  it('should emit analysis:error event', () => {
    gateway.emitAnalysisError('acc-1', 'job-1', 'Something failed')
    expect(mockServer.to).toHaveBeenCalledWith('acc-1')
    expect(mockEmit).toHaveBeenCalledWith('analysis:error', {
      accountId: 'acc-1',
      jobId: 'job-1',
      error: 'Something failed',
    })
  })

  it('should emit analysis:retry event with attempt metadata', () => {
    gateway.emitAnalysisRetry('acc-1', 'job-1', 2, 3)
    expect(mockServer.to).toHaveBeenCalledWith('acc-1')
    expect(mockEmit).toHaveBeenCalledWith('analysis:retry', {
      accountId: 'acc-1',
      jobId: 'job-1',
      attempt: 2,
      maxAttempts: 3,
    })
  })

  it('emitHeartbeat fires phase:progress with a heartbeat step and elapsed-second message', () => {
    gateway.emitHeartbeat('acc-1', 'job-1', 'research', 15, 30)
    expect(mockServer.to).toHaveBeenCalledWith('acc-1')
    expect(mockEmit).toHaveBeenCalledWith('phase:progress', {
      accountId: 'acc-1',
      jobId: 'job-1',
      phase: 'research',
      step: 'heartbeat:research',
      percent: 15,
      message: 'Analyse en cours… (30s)',
    })
  })
})

describe('AnalysisGateway — Socket.IO Redis adapter (afterInit)', () => {
  const REAL_ENV = process.env

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  const makeWsServer = () => ({ adapter: jest.fn(), use: jest.fn() })

  it('is a no-op (keeps the in-memory adapter) when REDIS_URL is unset — single-instance behaviour', () => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
    const server = makeWsServer()

    makeGatewayWith().gateway.afterInit(server as unknown as Server)

    expect(server.adapter).not.toHaveBeenCalled()
    expect(createAdapter as jest.Mock).not.toHaveBeenCalled()
    expect(IORedis as unknown as jest.Mock).not.toHaveBeenCalled()
  })

  it('attaches the Redis adapter (pub client + duplicated sub client) when REDIS_URL is set', () => {
    process.env = { ...REAL_ENV, REDIS_URL: 'redis://localhost:6379' }
    const server = makeWsServer()

    makeGatewayWith().gateway.afterInit(server as unknown as Server)

    // One explicit pub client; the sub client is created via pub.duplicate().
    expect(IORedis as unknown as jest.Mock).toHaveBeenCalledTimes(1)
    expect(createAdapter as jest.Mock).toHaveBeenCalledTimes(1)
    expect(server.adapter).toHaveBeenCalledWith('redis-adapter-instance')
  })

  it('onModuleDestroy resolves cleanly whether or not the adapter was attached', async () => {
    const gw = makeGatewayWith().gateway
    // No adapter attached (never ran afterInit) → nothing to close.
    await expect(gw.onModuleDestroy()).resolves.toBeUndefined()

    process.env = { ...REAL_ENV, REDIS_URL: 'redis://localhost:6379' }
    gw.afterInit(makeWsServer() as unknown as Server)
    await expect(gw.onModuleDestroy()).resolves.toBeUndefined()
  })

  it("monte l'authentification de connexion sur le serveur partagé", () => {
    const server = makeWsServer()

    makeGatewayWith().gateway.afterInit(server as unknown as Server)

    expect(server.use).toHaveBeenCalledTimes(1)
    expect(server.use).toHaveBeenCalledWith(expect.any(Function))
  })
})

/**
 * *As-tu le droit d'entrer dans CETTE salle ?* — la salle d'analyse est nommée
 * par un `accountId` fourni par l'appelant. Un UUID est de l'OBSCURITÉ, pas une
 * autorisation : le compte doit appartenir à l'espace de l'appelant, avec la
 * même question que le chemin HTTP (`where: { id, workspace_id }`).
 */
describe("AnalysisGateway — la salle d'un compte appartient à un espace", () => {
  const WORKSPACE = 'ws-de-l-appelant'
  const MINE = 'compte-de-mon-espace'
  const THEIRS = 'compte-d-un-concurrent'

  it("REFUSE un compte qui n'est PAS dans l'espace de l'appelant", async () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [MINE])
    const client = makeClientSocket('moi')

    await gateway.handleJoin(THEIRS, client as unknown as Socket)

    expect(client.join).not.toHaveBeenCalled()
  })

  it("interroge la base avec l'espace RÉSOLU, jamais avec un identifiant du message", async () => {
    const { gateway, findOneForWorkspace } = makeGatewayWith(WORKSPACE, [MINE])
    const client = makeClientSocket('moi')

    await gateway.handleJoin(MINE, client as unknown as Socket)

    expect(findOneForWorkspace).toHaveBeenCalledWith(MINE, WORKSPACE, null)
  })

  it("le membre de l'espace passe toujours (contrôle négatif)", async () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [MINE])
    const client = makeClientSocket('moi')

    await gateway.handleJoin(MINE, client as unknown as Socket)

    expect(client.join).toHaveBeenCalledWith(MINE)
  })

  it('REFUSE un socket sans identité prouvée, SANS toucher à la base (défense en profondeur)', async () => {
    const { gateway, findOneForWorkspace } = makeGatewayWith(WORKSPACE, [MINE])
    const anonymous = makeClientSocket()

    await gateway.handleJoin(MINE, anonymous as unknown as Socket)

    expect(anonymous.join).not.toHaveBeenCalled()
    expect(findOneForWorkspace).not.toHaveBeenCalled()
  })

  it("REFUSE quand l'espace de l'appelant ne peut pas être résolu (échec FERMÉ)", async () => {
    const { gateway } = makeGatewayWith(undefined, [MINE])
    const client = makeClientSocket('moi')

    await gateway.handleJoin(MINE, client as unknown as Socket)

    expect(client.join).not.toHaveBeenCalled()
  })

  it('REFUSE une salle vide ou non textuelle', async () => {
    const { gateway, findOneForWorkspace } = makeGatewayWith(WORKSPACE, [MINE])
    const client = makeClientSocket('moi')

    await gateway.handleJoin('', client as unknown as Socket)
    await gateway.handleJoin(undefined as unknown as string, client as unknown as Socket)

    expect(client.join).not.toHaveBeenCalled()
    expect(findOneForWorkspace).not.toHaveBeenCalled()
  })

  it('quitter reste libre : on ne quitte que ce que l’on porte soi-même', () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [MINE])
    const client = makeClientSocket('moi')

    gateway.handleLeave(MINE, client as unknown as Socket)

    expect(client.leave).toHaveBeenCalledWith(MINE)
  })
})

/**
 * #2710 — le temps réel de l'analyse était plus permissif que le HTTP :
 * `mayWatch` bornait à l'ESPACE, pas à l'UNITÉ. Un membre du même espace mais
 * d'une autre unité pouvait suivre la progression d'un compte que
 * `GET /analysis/status/:accountId` lui refusait déjà.
 */
describe("AnalysisGateway — #2710 la salle respecte aussi le périmètre d'unité, comme le HTTP", () => {
  const WORKSPACE = 'ws-de-l-appelant'
  const ACCOUNT = 'compte-unite-b'

  it("REFUSE un compte d'une AUTRE unité que celle de l'appelant, dans le même espace (test symétrique)", async () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [{ id: ACCOUNT, businessUnitId: 'unite-b' }], {
      businessUnitIds: ['unite-a'],
      includeUnassigned: true,
    })
    const client = makeClientSocket('moi')

    await gateway.handleJoin(ACCOUNT, client as unknown as Socket)

    expect(client.join).not.toHaveBeenCalled()
  })

  it("AUTORISE un compte de la MÊME unité que l'appelant (contrôle négatif)", async () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [{ id: ACCOUNT, businessUnitId: 'unite-a' }], {
      businessUnitIds: ['unite-a'],
      includeUnassigned: true,
    })
    const client = makeClientSocket('moi')

    await gateway.handleJoin(ACCOUNT, client as unknown as Socket)

    expect(client.join).toHaveBeenCalledWith(ACCOUNT)
  })

  it('résout le périmètre avec (espace, appelant), et le passe tel quel à la lecture du compte', async () => {
    const { gateway, scopeFor, findOneForWorkspace } = makeGatewayWith(
      WORKSPACE,
      [{ id: ACCOUNT, businessUnitId: 'unite-a' }],
      { businessUnitIds: ['unite-a'], includeUnassigned: true },
    )
    const client = makeClientSocket('moi')

    await gateway.handleJoin(ACCOUNT, client as unknown as Socket)

    expect(scopeFor).toHaveBeenCalledWith(WORKSPACE, 'moi')
    expect(findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT, WORKSPACE, {
      businessUnitIds: ['unite-a'],
      includeUnassigned: true,
    })
  })

  it("REFUSE (fail-closed) quand le service d'unités n'est pas câblé au constructeur", async () => {
    const resolveActiveWorkspace = jest.fn(() => Promise.resolve({ workspaceId: WORKSPACE, role: 'owner' as const }))
    const findOneForWorkspace = jest.fn()
    const gateway = new AnalysisGateway(
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
      { findOneForWorkspace } as unknown as AccountsService,
      undefined,
    )
    const client = makeClientSocket('moi')

    await gateway.handleJoin(ACCOUNT, client as unknown as Socket)

    expect(client.join).not.toHaveBeenCalled()
    expect(findOneForWorkspace).not.toHaveBeenCalled()
  })

  it('un compte SANS unité assignée reste visible (règle IS NULL, comme le HTTP)', async () => {
    const { gateway } = makeGatewayWith(WORKSPACE, [{ id: ACCOUNT, businessUnitId: null }], {
      businessUnitIds: ['unite-a'],
      includeUnassigned: true,
    })
    const client = makeClientSocket('moi')

    await gateway.handleJoin(ACCOUNT, client as unknown as Socket)

    expect(client.join).toHaveBeenCalledWith(ACCOUNT)
  })
})
