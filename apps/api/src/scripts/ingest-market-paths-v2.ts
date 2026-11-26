import dataSource from '../database/data-source'
import { createPgMarketPathsV2Store, deriveMarketPathsV2 } from './market-v2/market-paths-v2'

/**
 * Lot 791 — parcours observés dérivés du dataset `positions` du pack v2.1 déjà en base, lancé par l'OPÉRATEUR :
 *
 *   pnpm --filter @bellum/api ingest:market-paths-v2 [--dry-run]
 *
 * Idempotent (upsert sur `row_key`). `--dry-run` lit la base, compte, n'écrit rien. Code de sortie 1 si `positions`
 * n'est pas chargé (lancer d'abord `ingest:market-v2`). Moteur : `market-v2/market-paths-v2.ts`.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  await dataSource.initialize()
  try {
    const report = await deriveMarketPathsV2({
      store: createPgMarketPathsV2Store(dataSource),
      dryRun,
      log: line => console.log(line),
    })
    if (report.error) process.exitCode = 1
  } finally {
    await dataSource.destroy()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'échec inconnu')
  process.exitCode = 1
})
