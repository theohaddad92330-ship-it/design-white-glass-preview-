/**
 * #4035.1 — monte TOUTES les migrations sur une base VIERGE, pour le job CI « Démo (semis sur vraie base) ».
 *
 * Pourquoi pas `migration:run` : six migrations portent un nom à 14 chiffres (`20260927181000-…`, format
 * AAAAMMJJhhmmss, pas un horodatage en ms). TypeORM lit l'horodatage dans les 13 DERNIERS caractères du nom
 * (`0260927181000`) : elles se trient donc TOUT AU DÉBUT et `ALTER TABLE consultants` tombe avant que
 * `consultants` existe. La prod ne l'a jamais vu (elles y sont passées dans l'ordre du calendrier, sur une base
 * déjà peuplée) ; une base vierge, si. On ne les renomme pas — la prod les a enregistrées sous ce nom.
 *
 * Ordre ici : l'horodatage COMPLET du nom, comparé en nombre — un nom à 14 chiffres passe après tous ceux à 13,
 * ce qui est l'ordre voulu par leurs auteurs (27/09/2026). Chaque migration tourne dans sa propre transaction ;
 * la première qui échoue arrête tout et NOMME la migration et la requête.
 *
 * Usage : POSTGRES_HOST/PORT/USER/PASSWORD/DB (comme `data-source.ts`) → `ts-node --transpile-only scripts/migrate-fresh-ci.ts`.
 */
import { DataSource } from 'typeorm'
import { loadMigrations } from '../src/database/migrations-loader'

async function main(): Promise<void> {
  // Chargement + ordre partagés avec le test d'intégration (CI-3) : src/database/migrations-loader.ts.
  const loaded = await loadMigrations()

  const ds = new DataSource({
    type: 'postgres',
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    username: process.env['POSTGRES_USER'] ?? 'postgres',
    password: process.env['POSTGRES_PASSWORD'] ?? 'postgres',
    database: process.env['POSTGRES_DB'] ?? 'postgres',
  })
  await ds.initialize()
  const runner = ds.createQueryRunner()
  await runner.connect()
  // Le CI ne rejoue pas ce que la base porte déjà : un réexécution sur la même base est une erreur d'usage.
  let done = 0
  try {
    for (const { file, instance } of loaded) {
      await runner.startTransaction()
      try {
        await instance.up(runner)
        await runner.commitTransaction()
        done += 1
      } catch (error) {
        await runner.rollbackTransaction()
        const message = error instanceof Error ? error.message : String(error)
        console.error(`✗ migration ${file} (${done}/${loaded.length} passées) : ${message}`)
        process.exitCode = 1
        return
      }
    }
    console.log(`✓ ${done} migrations appliquées sur base vierge`)
  } finally {
    await runner.release()
    await ds.destroy()
  }
}

void main()
