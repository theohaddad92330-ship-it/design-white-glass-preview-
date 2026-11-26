import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { buildDumpCommand } from './migration-backup'
import { buildRestoreCommand } from './migration-restore'

/**
 * #2446.11 — LE DRILL COMPLET : SAUVEGARDER, DÉTRUIRE, RESTAURER, VÉRIFIER.
 *
 * Documenter une procédure de restauration ne prouve rien : la seule preuve
 * qu'un backup restaure vraiment les données est de le faire, une fois, contre
 * un vrai Postgres, et de relire les lignes après coup. C'est ce que ce
 * fichier fait — jamais contre la base de développement partagée : une base
 * JETABLE, créée et détruite par le test lui-même.
 *
 * OPT-IN, même interrupteur que `1786970000000-RagWorkspaceScope.db.spec.ts` :
 * `PG_TEST_URL` (ou un Postgres local par défaut sur `POSTGRES_HOST`/`_PORT`).
 * Lu SYNCHRONOUSLY avant que `describe` choisisse `it`/`it.skip` — sans quoi
 * CI resterait verte sans avoir rien prouvé.
 */

const execFileAsync = promisify(execFile)

const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RESTORE_DRILL_DB_TEST)

const ADMIN_ENV = {
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? 'localhost',
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? '5432',
  POSTGRES_USER: process.env.POSTGRES_USER ?? 'postgres',
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'postgres',
}

const DRILL_DB = `bellum_restore_drill_${Date.now()}`

const maybe = (): jest.It => (DB_TEST_ENABLED ? it : it.skip)

describe('#2446.11 — restore drill (backup réel → destruction → restauration → vérification)', () => {
  let admin: Client | undefined
  let backupDir: string | undefined

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    admin = new Client({
      host: ADMIN_ENV.POSTGRES_HOST,
      port: Number(ADMIN_ENV.POSTGRES_PORT),
      user: ADMIN_ENV.POSTGRES_USER,
      password: ADMIN_ENV.POSTGRES_PASSWORD,
      database: 'postgres',
      connectionTimeoutMillis: 5000,
    })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${DRILL_DB}`)
    backupDir = await mkdtemp(join(tmpdir(), 'migration-restore-drill-'))
  })

  afterAll(async () => {
    if (!admin) return
    await admin.query(`DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE)`).catch(async () => {
      // Postgres < 13 sans WITH (FORCE) : retente sans l'option.
      await admin!.query(`DROP DATABASE IF EXISTS ${DRILL_DB}`)
    })
    await admin.end()
    if (backupDir) await rm(backupDir, { recursive: true, force: true })
  })

  maybe()(
    'un backup pris avant la perte de données restaure les lignes à l’identique',
    async () => {
      const drillEnv = { ...ADMIN_ENV, POSTGRES_DB: DRILL_DB }

      const seed = new Client({
        host: drillEnv.POSTGRES_HOST,
        port: Number(drillEnv.POSTGRES_PORT),
        user: drillEnv.POSTGRES_USER,
        password: drillEnv.POSTGRES_PASSWORD,
        database: DRILL_DB,
      })
      await seed.connect()
      await seed.query('CREATE TABLE restore_drill_probe (id integer PRIMARY KEY, label text NOT NULL)')
      await seed.query("INSERT INTO restore_drill_probe (id, label) VALUES (1, 'avant-sinistre'), (2, 'toujours-la')")

      // 1. BACKUP — la MÊME commande que `migration-backup.ts` en usage réel.
      const { command: dumpCmd, args: dumpArgs, outputFile } = buildDumpCommand(drillEnv, new Date(), backupDir!)
      await execFileAsync(dumpCmd, dumpArgs, { env: { ...process.env, PGPASSWORD: drillEnv.POSTGRES_PASSWORD } })

      // 2. SINISTRE — les données sont perdues.
      await seed.query('DROP TABLE restore_drill_probe')
      await seed.end()

      // 3. RESTAURATION — la MÊME commande que `migration-restore.ts`.
      const { command: restoreCmd, args: restoreArgs } = buildRestoreCommand(drillEnv, outputFile)
      await execFileAsync(restoreCmd, restoreArgs, {
        env: { ...process.env, PGPASSWORD: drillEnv.POSTGRES_PASSWORD },
      })

      // 4. VÉRIFICATION — les lignes sont revenues, à l'identique.
      const verify = new Client({
        host: drillEnv.POSTGRES_HOST,
        port: Number(drillEnv.POSTGRES_PORT),
        user: drillEnv.POSTGRES_USER,
        password: drillEnv.POSTGRES_PASSWORD,
        database: DRILL_DB,
      })
      await verify.connect()
      const { rows } = await verify.query('SELECT id, label FROM restore_drill_probe ORDER BY id')
      await verify.end()

      expect(rows).toEqual([
        { id: 1, label: 'avant-sinistre' },
        { id: 2, label: 'toujours-la' },
      ])
    },
    30_000,
  )
})
