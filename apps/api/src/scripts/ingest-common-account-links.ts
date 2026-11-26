import dataSource from '../database/data-source'
import { createPgCommonAccountLinksStore, runCommonAccountLinks } from './common-account-links/common-account-links'

/**
 * Lot 793 — le référentiel pivot `common_account_links` (BM-A ↔ DF ↔ groupe ↔ clés normalisées), lancé par
 * l'OPÉRATEUR après `ingest:market-v2` :
 *
 *   pnpm --filter @bellum/api ingest:common-account-links [--dry-run]
 *
 * Idempotent (une ligne par clé × entreprise ; une ligne absente du calcul sort). `--dry-run` lit la base, compte,
 * n'écrit rien. Code de sortie 1 si `accounts` du pack v2.1 n'est pas chargé. Moteur : `common-account-links/`.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  await dataSource.initialize()
  try {
    const report = await runCommonAccountLinks({
      store: createPgCommonAccountLinksStore(dataSource),
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
