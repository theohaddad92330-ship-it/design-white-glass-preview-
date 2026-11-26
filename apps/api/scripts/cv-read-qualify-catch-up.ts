/**
 * Décision Louis 12/10 (`c97_cv_lu_fiche_qualifiee`) — rattrapage : les fiches dont le CV a
 * déjà été lu mais restées « à revoir » passent « qualifiée ». Gratuit, aucune IA, démo exclue,
 * jamais une fiche archivée ni non lue. SIMULATION par défaut ; écriture avec `--appliquer`.
 * Idempotent. Déclenché À LA MAIN, jamais au déploiement.
 *
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/cv-read-qualify-catch-up.ts [--appliquer]
 */
import dataSource from '../src/database/data-source'
import { ConsultantEntity } from '../src/database/entities/consultant.entity'
import { CvAutoParseService } from '../src/modules/consultants/cv-auto-parse.service'
import {
  formatReadQualifyReport,
  runReadQualifyCatchUp,
} from '../src/modules/consultants/cv-read-qualify-catch-up.runner'

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer')
  await dataSource.initialize()
  try {
    // Seul le dépôt de fiches sert ici (sélection + qualification).
    /* eslint-disable no-restricted-syntax -- script ponctuel : le constructeur Nest exige des
       dépendances que ni la sélection ni la qualification n'utilisent. */
    const service = new CvAutoParseService(
      null as never,
      null as never,
      null as never,
      dataSource.getRepository(ConsultantEntity),
      null as never,
    )
    /* eslint-enable no-restricted-syntax */
    const report = await runReadQualifyCatchUp({ service, apply })
    process.stdout.write(`${formatReadQualifyReport(report)}\n`)
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
