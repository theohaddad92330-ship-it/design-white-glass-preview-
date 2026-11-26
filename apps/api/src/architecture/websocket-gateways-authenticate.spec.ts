import 'reflect-metadata'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { GATEWAY_METADATA, MESSAGE_METADATA } from '@nestjs/websockets/constants'

/**
 * GA-44 — une passerelle WebSocket authentifie sa connexion et n'ouvre jamais
 * une salle nommée par le message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux passerelles du dépôt n'avaient AUCUN contrôle d'identité : ni garde,
 * ni `handleConnection`, ni intercepteur. `handleJoin` prenait l'identifiant
 * dans le corps du message — celui du profileur rejouait même le tampon de
 * l'identité nommée. Le seul filtre était le CORS, qui borne les origines d'un
 * NAVIGATEUR et ne dit rien d'un client écrit à la main.
 *
 * Le diagnostic dormait dans une archive marquée `DONE` depuis avril : un
 * document compté, jamais ouvert. Une garde vaut mieux qu'une ligne de
 * documentation, parce qu'elle est relue à chaque commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE VÉRIFIE LE MONTAGE, PAS LA PRÉSENCE D'UN MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Chercher `@UseGuards` ou `attachSocketAuthOnce` dans la source répéterait le
 * défaut corrigé cette semaine ailleurs — quatre routes portaient
 * `@RequirePermission` sans que le garde qui le lit soit attaché. Cette garde
 * INSTANCIE donc chaque passerelle, appelle son `afterInit` sur un faux serveur
 * et fait réellement passer une poignée de main anonyme dans l'intercepteur
 * qu'elle a monté. Un intercepteur absent, ou qui laisse passer, fait rougir.
 *
 * Puis elle appelle chaque gestionnaire de message avec une salle que
 * l'appelant NOMME, et vérifie qu'aucune n'est rejointe. C'est la traduction
 * exécutable de la règle : *l'identité vient du jeton, jamais du corps*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SI ELLE ROUGIT SUR UNE PASSERELLE NEUVE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - appeler `attachSocketAuthOnce(server, this.logger)` depuis `afterInit`
 *    (chaque passerelle l'appelle : retirer un module ne doit pas faire
 *    disparaître silencieusement l'authentification — règle n°7) ;
 *  - nommer la salle à partir de `socketPrincipal(client)`, ou prouver que
 *    l'identité prouvée a le droit d'entrer dans celle que le message nomme.
 */

const API_SRC = join(__dirname, '..')

/** Une salle que l'appelant NOMME — aucune passerelle ne doit l'ouvrir sur ce
 *  seul argument. Distincte de l'identité du socket, sinon un `join` légitime
 *  (« ma propre salle ») serait pris pour une infraction. */
const ROOM_NAMED_BY_THE_CALLER = 'salle-nommee-par-l-appelant'
const PROVEN_IDENTITY = 'identite-prouvee-par-le-jeton'

function gatewayFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...gatewayFiles(full))
      continue
    }
    if (!entry.endsWith('.gateway.ts') || entry.endsWith('.spec.ts')) continue
    // `supabase-auth.gateway.ts` est un adaptateur Supabase, pas une passerelle
    // Socket.IO : c'est le décorateur qui décide, pas le nom du fichier.
    if (!readFileSync(full, 'utf8').includes('@WebSocketGateway(')) continue
    out.push(full)
  }
  return out
}

type GatewayClass = new (...args: unknown[]) => Record<string, unknown>

/** Les classes décorées `@WebSocketGateway` exportées par ce fichier. */
async function gatewayClassesOf(file: string): Promise<GatewayClass[]> {
  const loaded = (await import(file)) as Record<string, unknown>
  return Object.values(loaded).filter(
    (exported): exported is GatewayClass =>
      typeof exported === 'function' && Reflect.getMetadata(GATEWAY_METADATA, exported) === true,
  )
}

/** Les méthodes portant `@SubscribeMessage`, avec l'événement qu'elles servent. */
function messageHandlersOf(cls: GatewayClass): Array<{ method: string; event: unknown }> {
  const prototype = cls.prototype as Record<string, unknown>
  return Object.getOwnPropertyNames(prototype)
    .filter(name => name !== 'constructor' && typeof prototype[name] === 'function')
    .map(name => ({ method: name, event: Reflect.getMetadata(MESSAGE_METADATA, prototype[name] as object) }))
    .filter(handler => handler.event !== undefined)
}

/** Une passerelle construite sans aucune dépendance : le chemin de REFUS ne
 *  doit en toucher aucune — c'est précisément ce qu'on veut prouver. */
function instantiate(cls: GatewayClass): Record<string, unknown> {
  return new cls(...new Array<unknown>(cls.length).fill(undefined))
}

type CapturedMiddleware = (socket: unknown, next: (error?: Error) => void) => void

function bootOnFakeServer(gateway: Record<string, unknown>): CapturedMiddleware[] {
  const captured: CapturedMiddleware[] = []
  const server = {
    adapter: () => undefined,
    to: () => ({ emit: () => undefined }),
    emit: () => undefined,
    use: (fn: CapturedMiddleware) => {
      captured.push(fn)
      return server
    },
  }
  ;(gateway['server'] as unknown) = server
  const afterInit = gateway['afterInit']
  if (typeof afterInit === 'function') (afterInit as (s: unknown) => void).call(gateway, server)
  return captured
}

const makeSocket = (identity?: string) => ({
  id: 'sock-de-garde',
  handshake: { headers: {}, auth: {} },
  data: identity ? { user: { userId: identity, email: '' } } : {},
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
})

describe('GA-44 — toute passerelle WebSocket authentifie et autorise', () => {
  const REAL_ENV = process.env
  const files = gatewayFiles(API_SRC)
  /** `[libellé lisible, chemin absolu]` — le libellé nomme le fichier dans le
   *  rapport de test, le chemin sert au chargement. */
  const cases = files.map(file => [relative(API_SRC, file), file] as const)

  beforeEach(() => {
    // `afterInit` ouvrirait une connexion Redis avec cette variable ; la garde
    // ne mesure que l'authentification.
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
  })

  afterEach(() => {
    process.env = REAL_ENV
  })

  it('LIT un corpus non vide — les passerelles Socket.IO du dépôt', async () => {
    // Sans cette mesure, la garde serait verte le jour où le motif de
    // découverte cesserait de trouver quoi que ce soit.
    expect(files.length).toBeGreaterThanOrEqual(2)
    const classes = (await Promise.all(files.map(gatewayClassesOf))).flat()
    expect(classes.length).toBeGreaterThanOrEqual(files.length)
  })

  it.each(cases)('%s — monte un intercepteur qui REFUSE une poignée de main anonyme', async (_label, file) => {
    for (const cls of await gatewayClassesOf(file)) {
      const middlewares = bootOnFakeServer(instantiate(cls))
      expect(middlewares).toHaveLength(1)

      const socket = makeSocket()
      const refusal = await new Promise<Error | undefined>(resolve => {
        ;(middlewares[0] as CapturedMiddleware)(socket, err => resolve(err))
      })

      expect(refusal).toBeInstanceOf(Error)
      expect(socket.data).toEqual({})
    }
  })

  it.each(cases)('%s — expose au moins un gestionnaire de message (corpus non vide)', async (_label, file) => {
    for (const cls of await gatewayClassesOf(file)) {
      expect(messageHandlersOf(cls).length).toBeGreaterThan(0)
    }
  })

  it.each(cases)("%s — n'ouvre AUCUNE salle nommée par le corps du message", async (_label, file) => {
    for (const cls of await gatewayClassesOf(file)) {
      for (const { method } of messageHandlersOf(cls)) {
        const gateway = instantiate(cls)
        bootOnFakeServer(gateway)

        const anonymous = makeSocket()
        await (gateway[method] as (body: unknown, client: unknown) => unknown).call(
          gateway,
          ROOM_NAMED_BY_THE_CALLER,
          anonymous,
        )
        expect(anonymous.join).not.toHaveBeenCalled()

        // Authentifié, mais la salle nommée n'est pas la sienne : l'identité
        // prouvée n'autorise pas TOUTE salle, seulement celles dont on peut
        // montrer qu'elle a le droit d'y entrer.
        const authenticated = makeSocket(PROVEN_IDENTITY)
        await (gateway[method] as (body: unknown, client: unknown) => unknown).call(
          gateway,
          ROOM_NAMED_BY_THE_CALLER,
          authenticated,
        )
        expect(authenticated.join).not.toHaveBeenCalled()
      }
    }
  })
})
