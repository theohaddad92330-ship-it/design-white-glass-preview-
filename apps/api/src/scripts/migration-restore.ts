import { spawn } from 'node:child_process'

/**
 * #2446.11 — RESTAURATION DE BACKUP RÉELLEMENT TESTÉE, PAS SEULEMENT DOCUMENTÉE.
 *
 *   pnpm --filter @bellum/api migration:restore <fichier.sql>
 *
 * Complément de `migration-backup.ts` (#2446.5) : sans un moyen de RESTAURER
 * un dump `pg_dump --format=custom`, le backup n'est qu'un fichier qu'on
 * espère utilisable le jour où on en a besoin. `migration-restore.db.spec.ts`
 * (opt-in, même interrupteur `PG_TEST_URL`/base locale 5440 que le reste du
 * dépôt — voir `1786970000000-RagWorkspaceScope.db.spec.ts`) le PROUVE contre
 * un vrai Postgres : sauvegarde, destruction des données, restauration,
 * vérification que les lignes sont revenues à l'identique.
 */

export function parseRestoreArgs(argv: string[]): { file: string } {
  const file = argv[0]
  if (!file) throw new Error('Usage: migration:restore <fichier.sql>')
  return { file }
}

export interface MigrationRestoreEnv {
  POSTGRES_HOST?: string
  POSTGRES_PORT?: string
  POSTGRES_USER?: string
  POSTGRES_PASSWORD?: string
  POSTGRES_DB?: string
}

/**
 * La commande `pg_restore` à lancer — pure, jamais exécutée ici. `--clean
 * --if-exists` : une restauration rejoue le schéma tel que le dump l'a figé,
 * jamais une fusion avec ce qui existe déjà (qui laisserait des lignes de
 * l'AVANT-restauration se mélanger à celles du dump).
 */
export function buildRestoreCommand(env: MigrationRestoreEnv, file: string): { command: string; args: string[] } {
  return {
    command: 'pg_restore',
    args: [
      `--host=${env.POSTGRES_HOST ?? 'localhost'}`,
      `--port=${env.POSTGRES_PORT ?? '5432'}`,
      `--username=${env.POSTGRES_USER ?? 'postgres'}`,
      `--dbname=${env.POSTGRES_DB ?? 'postgres'}`,
      '--no-password',
      '--clean',
      '--if-exists',
      file,
    ],
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
  const { file } = parseRestoreArgs(process.argv.slice(2))
  const { command, args } = buildRestoreCommand(process.env, file)
  console.log(`[migration:restore] restauration ← ${file}`)
  await run(command, args, { ...process.env, PGPASSWORD: process.env['POSTGRES_PASSWORD'] ?? 'postgres' })
  console.log('[migration:restore] OK')
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
