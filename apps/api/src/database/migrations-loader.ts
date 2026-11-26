/**
 * Charge TOUTES les migrations de `src/migrations` dans l'ordre d'une base VIERGE.
 *
 * Partagé par `scripts/migrate-fresh-ci.ts` (job « Démo ») et par le test d'intégration
 * `migrations-roundtrip.db.spec.ts` (job « Migrations sur vraie base »).
 *
 * Ordre : l'horodatage COMPLET du nom, comparé en nombre (un nom à 14 chiffres passe après tous ceux à 13).
 * TypeORM lit les 13 DERNIERS caractères et les trierait tout au début — voir l'en-tête de migrate-fresh-ci.ts.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MigrationInterface } from 'typeorm'

export type LoadedMigration = { key: bigint; file: string; instance: MigrationInterface }

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

export function migrationKey(file: string): bigint {
  const digits = /^(\d+)-/.exec(file)?.[1]
  if (!digits) throw new Error(`Nom de migration sans horodatage : ${file}`)
  return BigInt(digits)
}

/** Noms de fichiers de migration (hors specs), triés dans l'ordre d'application sur base vierge. */
export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter(f => /^\d+-.+\.ts$/.test(f) && !f.endsWith('.spec.ts'))
    .sort((a, b) => {
      const ka = migrationKey(a)
      const kb = migrationKey(b)
      return ka < kb ? -1 : ka > kb ? 1 : a.localeCompare(b)
    })
}

export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<LoadedMigration[]> {
  const loaded: LoadedMigration[] = []
  for (const file of listMigrationFiles(dir)) {
    const mod = (await import(join(dir, file))) as Record<string, unknown>
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue
      const instance = new (exported as new () => MigrationInterface)()
      if (typeof instance.up === 'function') loaded.push({ key: migrationKey(file), file, instance })
    }
  }
  return loaded
}
