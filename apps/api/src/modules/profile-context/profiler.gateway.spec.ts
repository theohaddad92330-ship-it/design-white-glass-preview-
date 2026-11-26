import type { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import IORedis from 'ioredis'
import { ProfilerGateway } from './profiler.gateway'

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => 'redis-adapter-instance'),
}))

/**
 * Fake Redis shared by every client instance: emulates the list commands the
 * replay buffer uses (RPUSH/EXPIRE via multi(), LRANGE, DEL) on a plain Map,
 * so a "second replica" reading the buffer sees what the first one pushed.
 */
const lists = new Map<string, string[]>()

jest.mock('ioredis', () => {
  const makeClient = (): Record<string, unknown> => {
    const client: Record<string, unknown> = {
      duplicate: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
      lrange: jest.fn((key: string) => Promise.resolve([...(lists.get(key) ?? [])])),
      del: jest.fn((key: string) => {
        lists.delete(key)
        return Promise.resolve(1)
      }),
      multi: jest.fn(() => {
        const queued: Array<() => void> = []
        const chain = {
          rpush: (key: string, value: string) => {
            queued.push(() => {
              const list = lists.get(key) ?? []
              list.push(value)
              lists.set(key, list)
            })
            return chain
          },
          expire: () => chain,
          exec: () => {
            queued.forEach(op => op())
            return Promise.resolve([])
          },
        }
        return chain
      }),
    }
    ;(client['duplicate'] as jest.Mock).mockImplementation(() => makeClient())
    return client
  }
  const ctor = jest.fn(() => makeClient())
  return { __esModule: true, default: ctor }
})

const makeWsServer = () => {
  const emit = jest.fn()
  return { adapter: jest.fn(), use: jest.fn(), to: jest.fn().mockReturnValue({ emit }), emit }
}

/**
 * Un socket déjà passé par l'intercepteur de connexion : `data.user` porte
 * l'identité PROUVÉE par le jeton. Sans argument, le socket est anonyme — ce
 * que l'intercepteur interdit, et que les gestionnaires refusent aussi (défense
 * en profondeur).
 */
const makeClientSocket = (authenticatedUserId?: string) => ({
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  data: authenticatedUserId ? { user: { userId: authenticatedUserId, email: '' } } : {},
})

describe('ProfilerGateway — single instance (no REDIS_URL)', () => {
  const REAL_ENV = process.env
  let gateway: ProfilerGateway
  let server: ReturnType<typeof makeWsServer>

  beforeEach(() => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
    server = makeWsServer()
    gateway = new ProfilerGateway()
    gateway.server = server as unknown as Server
    gateway.afterInit(server as unknown as Server)
  })

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  it('keeps the in-memory adapter and creates no Redis client — dev behaviour unchanged', () => {
    expect(server.adapter).not.toHaveBeenCalled()
    expect(createAdapter as jest.Mock).not.toHaveBeenCalled()
    expect(IORedis as unknown as jest.Mock).not.toHaveBeenCalled()
  })

  it('broadcasts live events to the profiler room', async () => {
    await gateway.emitPhaseStarted('user-1', 'reading', 'Analyse du site…')
    expect(server.to).toHaveBeenCalledWith('profiler:user-1')
    expect(server.emit).toHaveBeenCalledWith('profiler:phase:started', {
      userId: 'user-1',
      phase: 'reading',
      message: 'Analyse du site…',
    })
  })

  it('replays buffered events to a late joiner from the in-memory buffer', async () => {
    await gateway.emitField('user-1', 'positioning', 'Positionnement', 'ESN cyber…')
    const client = makeClientSocket('user-1')

    await gateway.handleJoin('user-1', client as unknown as Socket)

    expect(client.join).toHaveBeenCalledWith('profiler:user-1')
    expect(client.emit).toHaveBeenCalledWith('profiler:field:emitted', {
      userId: 'user-1',
      field: 'positioning',
      label: 'Positionnement',
      preview: 'ESN cyber…',
    })
  })

  it('emitDone clears the buffer so the next join replays nothing', async () => {
    await gateway.emitField('user-1', 'f', 'L', 'p')
    await gateway.emitDone('user-1')

    const client = makeClientSocket('user-1')
    await gateway.handleJoin('user-1', client as unknown as Socket)
    expect(client.emit).not.toHaveBeenCalled()
  })
})

describe('ProfilerGateway — multi-replica (REDIS_URL set)', () => {
  const REAL_ENV = process.env

  beforeEach(() => {
    lists.clear()
    process.env = { ...REAL_ENV, REDIS_URL: 'redis://localhost:6379' }
  })

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  const makeGateway = (server: ReturnType<typeof makeWsServer>) => {
    const gw = new ProfilerGateway()
    gw.server = server as unknown as Server
    gw.afterInit(server as unknown as Server)
    return gw
  }

  it('attaches the Redis adapter to the shared Socket.IO server', () => {
    const server = makeWsServer()
    makeGateway(server)
    expect(createAdapter as jest.Mock).toHaveBeenCalledTimes(1)
    expect(server.adapter).toHaveBeenCalledWith('redis-adapter-instance')
  })

  it('attaches the adapter only ONCE per shared server (analysis gateway usually won the race)', () => {
    const server = makeWsServer()
    makeGateway(server)
    makeGateway(server) // second gateway on the SAME server object
    expect(server.adapter).toHaveBeenCalledTimes(1)
  })

  it('replays events buffered by ANOTHER replica: push on A, join on B', async () => {
    const replicaA = makeGateway(makeWsServer())
    const replicaB = makeGateway(makeWsServer())

    await replicaA.emitPhaseStarted('user-9', 'reading', 'Démarrage…')
    await replicaA.emitField('user-9', 'offers', 'Offres', 'Cyber, Data')

    const client = makeClientSocket('user-9')
    await replicaB.handleJoin('user-9', client as unknown as Socket)

    expect(client.emit).toHaveBeenNthCalledWith(1, 'profiler:phase:started', {
      userId: 'user-9',
      phase: 'reading',
      message: 'Démarrage…',
    })
    expect(client.emit).toHaveBeenNthCalledWith(2, 'profiler:field:emitted', {
      userId: 'user-9',
      field: 'offers',
      label: 'Offres',
      preview: 'Cyber, Data',
    })
  })

  it('emitDone on one replica clears the shared buffer for every replica', async () => {
    const replicaA = makeGateway(makeWsServer())
    const replicaB = makeGateway(makeWsServer())

    await replicaA.emitField('user-9', 'f', 'L', 'p')
    await replicaA.emitDone('user-9')

    const client = makeClientSocket('user-9')
    await replicaB.handleJoin('user-9', client as unknown as Socket)
    expect(client.emit).not.toHaveBeenCalled()
  })

  it('a Redis buffer failure degrades replay but never blocks the live emit', async () => {
    const server = makeWsServer()
    const gw = makeGateway(server)
    // Force the buffer write to blow up.
    const redisCtor = IORedis as unknown as jest.Mock
    const client = redisCtor.mock.results.at(-1)?.value as { multi: jest.Mock }
    client.multi.mockImplementation(() => {
      throw new Error('redis down')
    })

    await expect(gw.emitPhaseStarted('user-1', 'reading', 'msg')).resolves.toBeUndefined()
    expect(server.emit).toHaveBeenCalledWith('profiler:phase:started', {
      userId: 'user-1',
      phase: 'reading',
      message: 'msg',
    })
  })

  it('onModuleDestroy closes the owned clients (graceful shutdown)', async () => {
    const gw = makeGateway(makeWsServer())
    await expect(gw.onModuleDestroy()).resolves.toBeUndefined()
  })
})

/**
 * Le second des deux gestes : *as-tu le droit d'entrer dans CETTE salle ?*
 *
 * La salle du profileur est PERSONNELLE — `profiler:{userId}` — et son tampon
 * rejoue tout ce que le profileur a dit de cette personne. L'identifiant venait
 * du MESSAGE : nommer celui d'un autre suffisait à entrer et à se faire rejouer
 * son tampon. L'identité vient désormais du jeton, jamais du corps.
 */
describe('ProfilerGateway — la salle est PERSONNELLE', () => {
  const REAL_ENV = process.env
  let gateway: ProfilerGateway
  let server: ReturnType<typeof makeWsServer>

  beforeEach(() => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
    lists.clear()
    server = makeWsServer()
    gateway = new ProfilerGateway()
    gateway.server = server as unknown as Server
    gateway.afterInit(server as unknown as Server)
  })

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  it("monte l'authentification de connexion sur le serveur partagé", () => {
    expect(server.use).toHaveBeenCalledTimes(1)
    expect(server.use).toHaveBeenCalledWith(expect.any(Function))
  })

  it("REFUSE un socket qui nomme l'identifiant d'un AUTRE : ni salle, ni rejeu du tampon", async () => {
    await gateway.emitField('victime', 'positioning', 'Positionnement', 'ESN cyber…')
    const intruder = makeClientSocket('curieux')

    await gateway.handleJoin('victime', intruder as unknown as Socket)

    expect(intruder.join).not.toHaveBeenCalled()
    expect(intruder.emit).not.toHaveBeenCalled()
  })

  it('REFUSE un socket sans identité prouvée (défense en profondeur)', async () => {
    await gateway.emitField('victime', 'positioning', 'Positionnement', 'ESN cyber…')
    const anonymous = makeClientSocket()

    await gateway.handleJoin('victime', anonymous as unknown as Socket)

    expect(anonymous.join).not.toHaveBeenCalled()
    expect(anonymous.emit).not.toHaveBeenCalled()
  })

  it('le PROPRIÉTAIRE passe toujours et reçoit bien son tampon (contrôle négatif)', async () => {
    await gateway.emitField('victime', 'positioning', 'Positionnement', 'ESN cyber…')
    const owner = makeClientSocket('victime')

    await gateway.handleJoin('victime', owner as unknown as Socket)

    expect(owner.join).toHaveBeenCalledWith('profiler:victime')
    expect(owner.emit).toHaveBeenCalledWith('profiler:field:emitted', {
      userId: 'victime',
      field: 'positioning',
      label: 'Positionnement',
      preview: 'ESN cyber…',
    })
  })

  it("ne quitte JAMAIS la salle d'un autre sur un `leave` qui la nomme", () => {
    const intruder = makeClientSocket('curieux')

    gateway.handleLeave('victime', intruder as unknown as Socket)

    expect(intruder.leave).not.toHaveBeenCalledWith('profiler:victime')
  })
})
