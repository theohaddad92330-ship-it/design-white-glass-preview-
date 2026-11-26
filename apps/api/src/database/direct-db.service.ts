import { Inject, Injectable, Logger, type OnModuleDestroy, Optional } from '@nestjs/common'
import { Client } from 'pg'
import { directConnectionWarning, resolveDirectConnection, type DirectConnectionConfig } from './direct-connection'

/** Ce que le service attend d'un client pg — un `pg.Client`, ou un double en test. */
export interface DirectPgClient {
  connect(): Promise<void>
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
  end(): Promise<void>
  on(event: 'error' | 'end', listener: (...args: unknown[]) => void): unknown
}

export const DIRECT_DB_ENV = Symbol('DIRECT_DB_ENV')
export const DIRECT_DB_CLIENT_FACTORY = Symbol('DIRECT_DB_CLIENT_FACTORY')

type ClientFactory = (cfg: DirectConnectionConfig) => DirectPgClient

/**
 * Bornes de la session dédiée. La purge démo la plus lente mesurée tient en
 * ~43 s par instruction (`account_entities`, 04/10/2026) : 120 s laisse la
 * marge sans laisser une requête folle tenir la connexion indéfiniment.
 */
const SESSION_SETTINGS = ["SET statement_timeout = '120s'", "SET idle_in_transaction_session_timeout = '60s'"]

/**
 * UNE connexion Postgres DÉDIÉE, directe/session (`POSTGRES_DIRECT_PORT`), hors
 * du pool des requêtes utilisateurs.
 *
 * Incident pool du 04/10/2026 : la purge démo (65-184 s sur 258 tables) et le
 * verrou qui la sérialise tenaient chacun une place du pooler Supavisor en mode
 * transaction, sur CHAQUE réplica — le pool partagé saturait jusqu'au login.
 * Cette connexion porte :
 *  - l'ÉLECTION du réplica qui balaie la démo : un verrou consultatif de
 *    SESSION, fiable ici (hors pooler transaction), tenu tant que la connexion
 *    vit et relâché par Postgres si le process meurt — le réplica suivant le
 *    reprend au balayage d'après. Plus robuste qu'un `DEMO_RESET_LEADER` posé à
 *    la main (un réplica désigné qui tombe = plus personne ne balaie) et que
 *    `RAILWAY_REPLICA_ID` (un identifiant par réplica, sans ordre ni « premier ») ;
 *  - le travail lourd, UN à la fois par process (file FIFO) : une connexion,
 *    pas un pool.
 *
 * Non configurée (variable absente) : `configured = false`, avertissement une
 * fois, et les appelants gardent leur chemin d'avant.
 */
@Injectable()
export class DirectDbService implements OnModuleDestroy {
  private readonly logger = new Logger(DirectDbService.name)
  private readonly cfg: DirectConnectionConfig
  readonly configured: boolean
  private readonly factory: ClientFactory
  private client: DirectPgClient | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private pending = 0
  /** Clés d'élection tenues par la session courante. Vidé si la connexion tombe. */
  private readonly held = new Set<string>()

  constructor(
    @Optional() @Inject(DIRECT_DB_ENV) env?: Record<string, string | undefined>,
    @Optional() @Inject(DIRECT_DB_CLIENT_FACTORY) factory?: ClientFactory,
  ) {
    this.cfg = resolveDirectConnection(env ?? process.env)
    this.configured = this.cfg.direct
    this.factory =
      factory ??
      (cfg =>
        new Client({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          password: cfg.password,
          database: cfg.database,
          ssl: cfg.ssl,
          connectionTimeoutMillis: 10_000,
          keepAlive: true,
        }) as unknown as DirectPgClient)
    const warning = directConnectionWarning(this.cfg)
    if (warning) this.logger.warn(warning)
  }

  /**
   * Exécute `work` SEUL sur la connexion dédiée (les autres attendent leur tour).
   * Hors leadership, la connexion est rendue à la fin : un réplica qui ne
   * balaie pas ne garde pas de session ouverte pour rien.
   */
  exclusive<T>(work: (client: DirectPgClient) => Promise<T>): Promise<T> {
    if (!this.configured) {
      return Promise.reject(new Error('DirectDbService: POSTGRES_DIRECT_PORT absent — connexion dédiée non configurée'))
    }
    this.pending += 1
    const job = this.queue.then(async () => {
      try {
        return await work(await this.connected())
      } finally {
        this.pending -= 1
        // Rendue seulement quand plus rien n'attend ET qu'aucune élection n'est tenue.
        if (this.pending === 0 && this.held.size === 0) await this.close()
      }
    })
    this.queue = job.catch(() => undefined)
    return job
  }

  /**
   * Ce process est-il l'élu pour `key` ? Le verrou de session est demandé UNE
   * fois ; ensuite, tant que la connexion vit, on le tient sans rien redemander.
   */
  async isLeader(key: string): Promise<boolean> {
    if (!this.configured) return false
    if (this.held.has(key) && this.client) return true
    return this.exclusive(async client => {
      const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS taken', [key])
      const taken = (rows as Array<{ taken?: unknown }>)[0]?.taken === true
      if (taken) this.held.add(key)
      return taken
    })
  }

  async onModuleDestroy(): Promise<void> {
    this.held.clear()
    await this.close()
  }

  private async connected(): Promise<DirectPgClient> {
    if (this.client) return this.client
    const client = this.factory(this.cfg)
    const lost = (error?: unknown): void => {
      if (this.client !== client) return
      // Postgres relâche les verrous de session avec la connexion : le
      // leadership tombe avec elle, il sera redemandé au prochain tour.
      this.client = null
      this.held.clear()
      if (error instanceof Error) this.logger.error(`Direct Postgres connection lost — ${error.message}`)
    }
    client.on('error', lost)
    client.on('end', () => lost())
    await client.connect()
    for (const sql of SESSION_SETTINGS) await client.query(sql)
    this.client = client
    return client
  }

  private async close(): Promise<void> {
    const client = this.client
    this.client = null
    if (client) await client.end().catch(() => undefined)
  }
}
