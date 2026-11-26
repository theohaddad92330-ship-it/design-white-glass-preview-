/**
 * #4045.1 — RATTRAPAGE PONCTUEL des liens d'offre des signaux de recrutement (Louis 12/10 :
 * un script, pas un bouton). Les comptes analysés avant #3922.3 n'ont pas `url` sur leurs
 * signaux `recrutement` ; l'offre brute, elle, est stockée avec son lien dans
 * `raw_analysis.it_job_signals`. On recopie — même intitulé, même jour, un seul lien possible ;
 * ambigu ou introuvable → rien, jamais deviné.
 *
 * COÛT : AUCUN appel réseau, AUCUN crédit, AUCUN appel modèle (une lecture + une écriture SQL par
 * compte). Ne touche ni `signals_collected_at` ni `declared_signals` : le segment n'est pas rejoué.
 *
 * SIMULATION par défaut (compte les signaux visés, par espace). Écriture seulement avec
 * `--appliquer`. Idempotent, reprenable ; `--limite N` borne le nombre de COMPTES mis à jour ;
 * `--workspace <uuid>` optionnel. Les espaces de démonstration sont exclus.
 *
 *   # 1. simulation (n'écrit rien)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/signal-url-catch-up.ts
 *
 *   # 2. écrire (par lots de 100 comptes)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/signal-url-catch-up.ts --appliquer --limite 100
 */
import dataSource from '../src/database/data-source'
import {
  formatSignalUrlCatchUpReport,
  runSignalUrlCatchUp,
  sqlSignalUrlCatchUpPort,
} from '../src/modules/analysis/signal-url-catch-up.runner'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer')
  const limitRaw = arg('limite')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  if (limit !== undefined && !Number.isFinite(limit)) throw new Error('--limite attend un nombre')
  await dataSource.initialize()
  try {
    const report = await runSignalUrlCatchUp({
      port: sqlSignalUrlCatchUpPort(dataSource.manager),
      apply,
      workspaceId: arg('workspace'),
      limit,
    })
    process.stdout.write(`${formatSignalUrlCatchUpReport(report)}\n`)
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
