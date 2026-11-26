import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Client } from 'pg'
import { resolveDirectConnection, type DirectConnectionConfig } from '../../database/direct-connection'

/**
 * Relevé AGRÉGÉ de `pg_stat_activity`, pour la supervision.
 *
 * Incident pool du 04/10/2026 (soir) : la cause racine n'a pas pu être tranchée
 * — `pg_stat_activity` était illisible au moment où il fallait le lire (psql
 * via le pooler saturé → ECHECKOUTTIMEOUT). Ce relevé :
 *  - passe par la connexion DIRECTE/session (`POSTGRES_DIRECT_PORT`), sur un
 *    client COURT (ouvert, une requête, fermé) — jamais par le pool des
 *    requêtes utilisateurs, qui est justement celui qui sature ;
 *  - se lit à la DEMANDE (onglet de supervision), mis en cache 60 s : zéro
 *    charge quand personne ne regarde ;
 *  - n'expose JAMAIS le texte d'une requête (colonne `query` jamais lue), ni
 *    un utilisateur, ni une adresse : des compteurs, un âge, des types d'attente.
 */

/** Agrégé côté serveur : quelques lignes, quel que soit le nombre de connexions. */
export const PG_ACTIVITY_SQL = `
SELECT state,
       wait_event_type,
       count(*)::int AS n,
       (count(*) FILTER (WHERE state = 'idle in transaction' AND now() - state_change > interval '30 seconds'))::int AS idle_tx_30s,
       min(xact_start) AS oldest_xact_start
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
 GROUP BY state, wait_event_type`

interface ActivityRow {
  state: string | null
  wait_event_type: string | null
  n: number
  idle_tx_30s: number
  oldest_xact_start: string | Date | null
}

interface ResumeActivite {
  total: number
  parEtat: Record<string, number>
  parTypeAttente: Record<string, number>
  idleInTransactionPlusDe30s: number
  /** `null` = aucune transaction ouverte — jamais « 0 ». */
  plusVieilleTransactionSecondes: number | null
}

export type ReleveActivite =
  | ({ etat: 'lu'; releveA: string; connexion: 'directe' | 'pooler' } & ResumeActivite)
  | { etat: 'illisible'; releveA: string; connexion: 'directe' | 'pooler'; raison: string }

export function resumerActivite(rows: ActivityRow[], now: Date): ResumeActivite {
  const parEtat: Record<string, number> = {}
  const parTypeAttente: Record<string, number> = {}
  let total = 0
  let idle = 0
  let oldest: number | null = null
  for (const row of rows) {
    const n = Number(row.n) || 0
    total += n
    const etat = row.state ?? 'aucun'
    parEtat[etat] = (parEtat[etat] ?? 0) + n
    const attente = row.wait_event_type ?? 'aucun'
    parTypeAttente[attente] = (parTypeAttente[attente] ?? 0) + n
    idle += Number(row.idle_tx_30s) || 0
    if (row.oldest_xact_start !== null) {
      const t = new Date(row.oldest_xact_start).getTime()
      if (Number.isFinite(t) && (oldest === null || t < oldest)) oldest = t
    }
  }
  return {
    total,
    parEtat,
    parTypeAttente,
    idleInTransactionPlusDe30s: idle,
    plusVieilleTransactionSecondes: oldest === null ? null : Math.max(0, Math.round((now.getTime() - oldest) / 1000)),
  }
}

interface ShortClient {
  connect(): Promise<void>
  query(sql: string): Promise<{ rows: unknown[] }>
  end(): Promise<void>
}

export const PG_ACTIVITE_ENV = Symbol('PG_ACTIVITE_ENV')
export const PG_ACTIVITE_CLIENT_FACTORY = Symbol('PG_ACTIVITE_CLIENT_FACTORY')

const CACHE_MS = 60_000

@Injectable()
export class PostgresActiviteService {
  private readonly logger = new Logger(PostgresActiviteService.name)
  private readonly cfg: DirectConnectionConfig
  private readonly factory: (cfg: DirectConnectionConfig) => ShortClient
  private cache: { at: number; value: ReleveActivite } | null = null

  constructor(
    @Optional() @Inject(PG_ACTIVITE_ENV) env?: Record<string, string | undefined>,
    @Optional() @Inject(PG_ACTIVITE_CLIENT_FACTORY) factory?: (cfg: DirectConnectionConfig) => ShortClient,
  ) {
    this.cfg = resolveDirectConnection(env ?? process.env)
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
          connectionTimeoutMillis: 5_000,
        }) as unknown as ShortClient)
  }

  async releve(): Promise<ReleveActivite> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value
    const value = await this.lire()
    this.cache = { at: Date.now(), value }
    return value
  }

  private async lire(): Promise<ReleveActivite> {
    const now = new Date()
    const connexion = this.cfg.direct ? 'directe' : 'pooler'
    const client = this.factory(this.cfg)
    try {
      await client.connect()
      await client.query("SET statement_timeout = '5s'")
      const { rows } = await client.query(PG_ACTIVITY_SQL)
      return { etat: 'lu', releveA: now.toISOString(), connexion, ...resumerActivite(rows as ActivityRow[], now) }
    } catch (error) {
      // Message SEUL : l'objet d'erreur pg peut porter la config de connexion.
      const raison = error instanceof Error ? error.message : String(error)
      this.logger.warn(`pg_stat_activity illisible — ${raison}`)
      return { etat: 'illisible', releveA: now.toISOString(), connexion, raison }
    } finally {
      await client.end().catch(() => undefined)
    }
  }
}
