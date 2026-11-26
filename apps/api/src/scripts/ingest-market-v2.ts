import dataSource from '../database/data-source'
import { loadMarketV2Schema, runMarketV2Import } from './market-v2/market-v2-import'
import { createPgMarketV2Store } from './market-v2/market-v2-store'

/**
 * Lot 783 (#5205) — import du pack marché v2.1 (139 tables), lancé par l'OPÉRATEUR :
 *
 *   pnpm --filter @bellum/api ingest:market-v2 <dossier BELLUM_MARKET_MEMORY_v2> [--dry-run] [--only=<table>]
 *
 * Le moteur et son contrat : `market-v2/market-v2-import.ts`. `--dry-run` lit, contrôle et compte tout sans ouvrir
 * la base. Code de sortie 1 au premier écart (en-tête, MANIFEST, table en échec) ; relancer la même commande reprend
 * là où l'import s'est arrêté.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dir = args.find(a => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const only = args.find(a => a.startsWith('--only='))?.slice('--only='.length)
  if (!dir) {
    console.error('Usage: ingest-market-v2 <dossier du pack v2.1> [--dry-run] [--only=<table>]')
    process.exitCode = 1
    return
  }

  const schema = loadMarketV2Schema()
  if (dryRun) console.log('Mode à blanc : aucune connexion à la base, aucune écriture.')
  else await dataSource.initialize()
  try {
    const report = await runMarketV2Import({
      dir,
      schema,
      store: dryRun ? null : createPgMarketV2Store(dataSource),
      only,
      log: line => console.log(line),
    })
    if (report.error) process.exitCode = 1
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'échec inconnu')
  process.exitCode = 1
})
