import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Server, Socket } from 'socket.io'
import { JwtStrategy } from '../../modules/auth/jwt.strategy'
import type { SessionRegistryService } from '../../modules/auth/session-registry.service'
import { attachSocketAuthOnce, socketPrincipal } from './socket-identity'

/**
 * Le secret de repli que `JwtStrategy` se donne sous `NODE_ENV=test` quand
 * `supabaseJwtSecret` est vide. On signe avec LUI : le test vérifie la vraie
 * vérification de signature, pas une constante recopiée.
 */
const TEST_SECRET = 'test-jwt-secret'

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const configStub = { get: <T>(_key: string, defaultValue?: T): T => defaultValue as T } as unknown as ConfigService

const jwt = new JwtService()

/** `expiresIn` en SECONDES : négatif = déjà expiré. */
function signAccessToken(userId: string, options: { expiresIn?: number; audience?: string } = {}): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.test` },
    { secret: TEST_SECRET, audience: options.audience ?? 'authenticated', expiresIn: options.expiresIn ?? 300 },
  )
}

type Handshake = { headers: Record<string, string>; auth: Record<string, unknown> }

function makeSocket(handshake: Partial<Handshake> = {}): Socket & { data: Record<string, unknown> } {
  return {
    id: 'sock-1',
    handshake: { headers: handshake.headers ?? {}, auth: handshake.auth ?? {} },
    data: {},
    disconnect: jest.fn(),
  } as unknown as Socket & { data: Record<string, unknown> }
}

type Middleware = (socket: Socket, next: (err?: Error) => void) => void

function mountAuth(): { middlewares: Middleware[]; server: Server } {
  const middlewares: Middleware[] = []
  const server = {
    use: (fn: Middleware) => {
      middlewares.push(fn)
      return server
    },
  } as unknown as Server
  attachSocketAuthOnce(server, new Logger('test'))
  return { middlewares, server }
}

/** Fait passer un socket par l'intercepteur monté et rend l'erreur éventuelle. */
async function handshakeThrough(socket: Socket, middlewares: Middleware[]): Promise<Error | undefined> {
  const [middleware] = middlewares
  if (!middleware) throw new Error('aucun intercepteur monté')
  return new Promise<Error | undefined>(resolve => {
    middleware(socket, err => resolve(err))
  })
}

describe('socket-identity — authentification de la POIGNÉE DE MAIN', () => {
  const REAL_ENV = process.env

  beforeAll(() => {
    // Enregistre la stratégie `jwt` sur le singleton passport, exactement comme
    // le fait `AuthModule` au démarrage. Une seule source de vérité pour les
    // algorithmes, l'audience et le cookie de session. Le registre de sessions
    // (révocation par requête, finding #6) n'est pas exercé ici — un stub suffit.
    const sessionsStub = { isRevoked: async () => false } as unknown as SessionRegistryService
    new JwtStrategy(configStub, sessionsStub)
  })

  beforeEach(() => {
    process.env = { ...REAL_ENV, NODE_ENV: 'test' }
  })

  afterEach(() => {
    process.env = REAL_ENV
  })

  it("monte UN intercepteur sur le serveur partagé, et un seul (les deux passerelles l'appellent)", () => {
    const middlewares: Middleware[] = []
    const server = {
      use: (fn: Middleware) => {
        middlewares.push(fn)
        return server
      },
    } as unknown as Server

    attachSocketAuthOnce(server, new Logger('test'))
    attachSocketAuthOnce(server, new Logger('test'))

    expect(middlewares).toHaveLength(1)
  })

  it('REFUSE une poignée de main sans aucune preuve d’identité', async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket()

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })

  it('accepte un jeton porté par `auth.token` (client hors navigateur)', async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({ auth: { token: signAccessToken(OWNER) } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeUndefined()
    expect(socketPrincipal(socket)).toEqual({ userId: OWNER, email: `${OWNER}@example.test` })
  })

  it('accepte le cookie de session que le navigateur joint à la poignée de main', async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({ headers: { cookie: `session:${OWNER}=${signAccessToken(OWNER)}` } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeUndefined()
    expect(socketPrincipal(socket)?.userId).toBe(OWNER)
  })

  it("lit le cookie de l'identité DÉCLARÉE par l'onglet, pas le premier cookie venu", async () => {
    const { middlewares } = mountAuth()
    // Deux identités dans le même navigateur (démonstration + vrai compte) :
    // celle du second cookie est celle que l'onglet déclare.
    const socket = makeSocket({
      headers: { cookie: `session:${OTHER}=${signAccessToken(OTHER)}; session:${OWNER}=${signAccessToken(OWNER)}` },
      auth: { userId: OWNER },
    })

    await handshakeThrough(socket, middlewares)

    expect(socketPrincipal(socket)?.userId).toBe(OWNER)
  })

  it("REFUSE quand l'onglet déclare une identité dont ce navigateur n'a pas le cookie", async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({
      headers: { cookie: `session:${OTHER}=${signAccessToken(OTHER)}` },
      auth: { userId: OWNER },
    })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })

  it('REFUSE un jeton expiré', async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({ auth: { token: signAccessToken(OWNER, { expiresIn: -60 }) } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })

  it("REFUSE un jeton d'une autre audience (jeton de service rejoué)", async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({ auth: { token: signAccessToken(OWNER, { audience: 'service_role' }) } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })

  it('REFUSE un jeton signé avec un autre secret', async () => {
    const { middlewares } = mountAuth()
    const forged = jwt.sign({ sub: OWNER }, { secret: 'pas-le-bon-secret', audience: 'authenticated', expiresIn: 300 })
    const socket = makeSocket({ auth: { token: forged } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })

  it('REFUSE du charabia à la place du jeton', async () => {
    const { middlewares } = mountAuth()
    const socket = makeSocket({ auth: { token: 'pas.un.jeton' } })

    const error = await handshakeThrough(socket, middlewares)

    expect(error).toBeInstanceOf(Error)
    expect(socketPrincipal(socket)).toBeNull()
  })
})
