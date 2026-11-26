import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'
import { ENTITIES } from './database.module'
import { applyDirectSessionSettings, resolveDirectConnection } from './direct-connection'
import { registerPgDateParser } from './pg-date'

loadEnv()

// Les migrations ouvrent leur PROPRE connexion : sans cette ligne, une
// migration qui lit une colonne `date` verrait des objets là où l'API voit des
// chaînes — la divergence que ce module existe pour fermer.
registerPgDateParser()

// Incident pool du 04/10/2026 — les migrations passent par la connexion
// DIRECTE/SESSION (`POSTGRES_DIRECT_PORT` / `POSTGRES_DIRECT_HOST`), hors du
// pooler transaction des requêtes utilisateurs. Sans variable : inchangé.
const connection = resolveDirectConnection()

export default new DataSource({
  type: 'postgres',
  host: connection.host,
  port: connection.port,
  username: connection.user,
  password: connection.password,
  database: connection.database,
  entities: ENTITIES,
  migrations: [`${__dirname}/../migrations/*.{ts,js}`],
  migrationsTableName: '_migrations',
  ssl: connection.ssl,
  // `onConnect` (pg-pool) est attendu AVANT que le client serve : chaque session
  // de migration porte `lock_timeout = 10s` et `statement_timeout = 0`. Seulement
  // en connexion directe — via le pooler transaction, un `SET` de session ne
  // tiendrait pas d'une requête à l'autre.
  ...(connection.direct ? { extra: { onConnect: applyDirectSessionSettings } } : {}),
})
