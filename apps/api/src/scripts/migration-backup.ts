import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

/**
 * #2446.5 — GOUVERNANCE DE MIGRATION : LE BACKUP + DRY-RUN QUI N'EXISTAIENT PAS.
 *
 *   pnpm --filter @bellum/api migration:backup            # backup puis migration:run
 *   pnpm --filter @bellum/api migration:backup --dry-run   # ne touche rien
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SCRIPT COUVRE, ET CE QU'IL NE COUVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2446.5 demande quatre garanties : backup, transaction, idempotence, dry run.
 * La TRANSACTION est déjà le défaut de `typeorm migration:run` (mode `-t all`,
 * jamais changé dans `package.json`) : les migrations en attente s'exécutent
 * déjà dans une transaction. L'IDEMPOTENCE est une propriété PAR migration —
 * 578 fichiers existants, hors de portée d'un script générique ; ``down()``
 * disant « not supported » sur ~206 d'entre eux reste un chantier de
 * remédiation migration par migration.
 *
 * Ce script comble le reste, qui n'existait PAS DU TOUT : un BACKUP pris avant
 * de migrer (jamais migrer une base de prod sans un point de restauration
 * frais — voir `migration-restore.ts`, #2446.11), et un DRY-RUN qui ne prend
 * aucun backup et ne migre rien — seulement montrer ce qui serait fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊMES VARIABLES QUE `data-source.ts` ET `migrate-with-lock.mjs`
 * ─────────────────────────────────────────────────────────────────────────────
 * `migrate-with-lock.mjs` documente déjà la faute : lire `DATABASE_URL` (absent
 * de cet environnement) au lieu des variables `POSTGRES_*` que le migrateur lit
 * réellement ferait sauvegarder une base et en migrer une autre. Ce script lit
 * donc EXACTEMENT les mêmes clés, avec les mêmes défauts.
 */

export function parseCliArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') }
}

/**
 * Un horodatage NON ROND, lisible, sans `:` (invalide dans un nom de fichier
 * sur la plupart des systèmes) — un backup par exécution, jamais écrasé.
 */
export function formatBackupFilename(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/:/g, '-')}.sql`
}

export interface MigrationBackupEnv {
  POSTGRES_HOST?: string
  POSTGRES_PORT?: string
  POSTGRES_USER?: string
  POSTGRES_PASSWORD?: string
  POSTGRES_DB?: string
}

/**
 * La commande `pg_dump` à lancer, jamais exécutée ici — une fonction PURE pour
 * rester testable sans base réelle. Le mot de passe ne passe jamais en
 * argument (visible dans `ps`/les journaux) : `main()` le porte via la
 * variable d'environnement `PGPASSWORD` du process enfant.
 */
export function buildDumpCommand(
  env: MigrationBackupEnv,
  now: Date,
  backupDir: string,
): { command: string; args: string[]; outputFile: string } {
  const outputFile = `${backupDir}/${formatBackupFilename(now)}`
  return {
    command: 'pg_dump',
    args: [
      `--host=${env.POSTGRES_HOST ?? 'localhost'}`,
      `--port=${env.POSTGRES_PORT ?? '5432'}`,
      `--username=${env.POSTGRES_USER ?? 'postgres'}`,
      `--dbname=${env.POSTGRES_DB ?? 'postgres'}`,
      '--no-password',
      '--format=custom',
      `--file=${outputFile}`,
    ],
    outputFile,
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} a échoué (code ${code})`))
    })
  })
}

async function main(): Promise<void> {
  const { dryRun } = parseCliArgs(process.argv.slice(2))
  const backupDir = process.env['MIGRATION_BACKUP_DIR'] ?? 'backups'

  if (dryRun) {
    console.log('[migration:backup] --dry-run : aucun backup pris, aucune migration lancée.')
    console.log('[migration:backup] lancerait : typeorm-ts-node-commonjs migration:show -d src/database/data-source.ts')
    await run('typeorm-ts-node-commonjs', ['migration:show', '-d', 'src/database/data-source.ts'], process.env)
    return
  }

  await mkdir(backupDir, { recursive: true })
  const { command, args, outputFile } = buildDumpCommand(process.env, new Date(), backupDir)
  console.log(`[migration:backup] backup → ${outputFile}`)
  // JAMAIS le mot de passe en argument (visible dans `ps`) — porté par
  // l'environnement du process enfant, comme `pg_dump` le lit nativement.
  await run(command, args, { ...process.env, PGPASSWORD: process.env['POSTGRES_PASSWORD'] ?? 'postgres' })

  console.log('[migration:backup] backup OK — migration…')
  await run('typeorm-ts-node-commonjs', ['migration:run', '-d', 'src/database/data-source.ts'], process.env)
}

// ⚠️ Même garde que les autres scripts de ce dossier : un `import` depuis un
// test ne doit jamais lancer un vrai `pg_dump` ni une vraie migration.
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
