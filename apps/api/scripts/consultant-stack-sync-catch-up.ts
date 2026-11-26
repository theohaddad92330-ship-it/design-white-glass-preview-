/**
 * #5016.2 — rattrapage CIBLÉ des fiches consultants dont la liste libre
 * (`consultants.stack`) diverge du référentiel typé (`consultant_skills`, qui
 * FAIT FOI). Un seul espace par lancement : `--workspace <uuid>` est requis.
 *
 * SIMULATION par défaut : affiche le nombre de fiches touchées et n'écrit rien.
 * N'écrit qu'avec `--appliquer`. ADDITIF (rien n'est retiré — une correction
 * humaine n'est jamais écrasée) et idempotent.
 *
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/consultant-stack-sync-catch-up.ts --workspace <uuid>
 *   … --workspace <uuid> --appliquer
 */
import dataSource from '../src/database/data-source'
import { runStackSyncCatchUp } from '../src/modules/consultants/skill-seed'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const workspaceId = arg('workspace')
  if (!workspaceId) throw new Error('Usage : --workspace <uuid> [--appliquer]')
  const apply = process.argv.includes('--appliquer')
  await dataSource.initialize()
  try {
    const report = await runStackSyncCatchUp(dataSource.manager, { workspaceId, apply })
    const mode = apply ? 'APPLIQUÉ' : 'SIMULATION (rien n’est écrit — relancer avec --appliquer)'
    console.log(
      `[#5016] ${mode} : ${report.examined} fiches examinées, ${report.divergent} divergentes, ${report.written} écrites.`,
    )
  } finally {
    await dataSource.destroy()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
