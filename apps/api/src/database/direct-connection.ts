/**
 * La connexion DIRECTE (ou en mode SESSION) à Postgres — hors du pooler
 * Supavisor en mode TRANSACTION qu'utilise le pool des requêtes utilisateurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INCIDENT POOL DU 04/10/2026 (deux occurrences, matin et soir)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'API (2 réplicas × `DB_POOL_MAX`), le client de migration du pré-déploiement
 * et le re-semis démo passaient TOUS par le port 6543 (Supavisor, mode
 * transaction). Le `pool_size` de Supavisor dépassé : file, puis
 * « authentication did not complete within 15000ms » / ECHECKOUTTIMEOUT —
 * toute l'API en 500, et les migrations des déploiements en échec, donc plus
 * aucun déploiement possible pour réparer.
 *
 * Deux défauts de fond, que cette connexion corrige :
 *  1. un verrou consultatif de SESSION (`pg_try_advisory_lock`) via un pooler
 *     TRANSACTION n'est pas fiable : le backend change entre deux requêtes, le
 *     verrou « obtenu » ne protège rien. En connexion directe ou session, il
 *     tient tant que la connexion tient, et Postgres le relâche si le process
 *     meurt ;
 *  2. le travail long (migrations, purge démo) prenait des places du pool
 *     partagé par les requêtes des utilisateurs.
 *
 * Variables (détail : `agent_docs/env-reference.md`) :
 *  - `POSTGRES_DIRECT_PORT` — 5432 sur l'hôte du pooler Supabase = mode
 *    SESSION (une connexion = un backend) ;
 *  - `POSTGRES_DIRECT_HOST` — facultatif, `db.<ref>.supabase.co` pour une
 *    connexion vraiment directe ; défaut : `POSTGRES_HOST`.
 * Aucune des deux posée → comportement d'avant INCHANGÉ (même hôte, même port
 * que l'API) et un avertissement explicite — jamais un port deviné.
 *
 * ⚠️ Module PUR, sans Nest : il est chargé COMPILÉ par
 * `scripts/migrate-with-lock.mjs` (`dist/database/direct-connection.js`). Le
 * verrou et le migrateur lisent donc la MÊME configuration par construction.
 */

export interface DirectConnectionConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: false | { rejectUnauthorized: false }
  /** `true` = une variable directe est posée ; `false` = repli sur la config de l'API. */
  direct: boolean
}

type Env = Record<string, string | undefined>

function readPort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null
}

export function resolveDirectConnection(env: Env = process.env): DirectConnectionConfig {
  const apiHost = env['POSTGRES_HOST'] ?? 'localhost'
  const apiPort = readPort(env['POSTGRES_PORT']) ?? 5432
  const directHost = env['POSTGRES_DIRECT_HOST']?.trim() || null
  const directPort = readPort(env['POSTGRES_DIRECT_PORT'])
  return {
    host: directHost ?? apiHost,
    port: directPort ?? apiPort,
    user: env['POSTGRES_USER'] ?? 'postgres',
    password: env['POSTGRES_PASSWORD'] ?? 'postgres',
    database: env['POSTGRES_DB'] ?? 'postgres',
    ssl: env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    direct: directHost !== null || directPort !== null,
  }
}

/** L'avertissement du repli — NOMME la variable, jamais une valeur (ni hôte, ni secret). */
export function directConnectionWarning(cfg: DirectConnectionConfig): string | null {
  if (cfg.direct) return null
  return (
    'POSTGRES_DIRECT_PORT absent : migrations, verrous consultatifs et purge démo passent par le MÊME pooler ' +
    "que l'API (port " +
    String(cfg.port) +
    '). En mode transaction (6543), un verrou de session ne protège rien et ce travail prend des places ' +
    'du pool partagé — incident du 04/10/2026. Poser POSTGRES_DIRECT_PORT=5432 (mode session).'
  )
}

/**
 * Réglages de la session de MIGRATION (incident du 04/10/2026, soir : un
 * `ALTER TABLE` coupé par le `statement_timeout` du serveur au milieu d'une
 * base saturée) :
 *  - `lock_timeout` court : une migration qui attend un verrou de table
 *    échoue en 10 s, avec un message clair, au lieu de faire la queue derrière
 *    une transaction longue en bloquant toutes les requêtes qui arrivent ;
 *  - `statement_timeout` levé : une fois le verrou obtenu, un `ALTER` légitime
 *    n'est pas coupé au milieu par le plafond pensé pour les requêtes HTTP.
 */
export const DIRECT_SESSION_SETTINGS = ["SET lock_timeout = '10s'", 'SET statement_timeout = 0'] as const

export async function applyDirectSessionSettings(client: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  for (const sql of DIRECT_SESSION_SETTINGS) await client.query(sql)
}
