/**
 * #3883 — RATTRAPAGE PONCTUEL des fiches consultants dont le CV a été lu avant le
 * correctif de complétude (décision Louis 10/10 : un script, pas un bouton).
 *
 * Relit les CV incomplets d'UN espace, par la file de lecture automatique
 * existante (`CvAutoParseService`) : mêmes gardes que le vivier — jamais une fiche
 * archivée ni portant une correction humaine (c97, 12/10 : une fiche AUTO-qualifiée
 * est relue et reste qualifiée). Recolle d'abord un `cv_text` épelé (#3935.6). Aucun crédit débité.
 *
 * SIMULATION par défaut (compte les fiches visées, n'écrit rien). Écriture
 * seulement avec `--appliquer`. Idempotent et reprenable : relancer ne remet pas
 * en file une fiche déjà relue ni déjà en attente ; `--limite N` découpe en lots.
 *
 * Connexion : variables standard de l'API (POSTGRES_*, REDIS_URL) — jamais affichées.
 *
 *   # 1. simulation (n'écrit rien)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/cv-completeness-catch-up.ts --workspace <uuid> --user <uuid>
 *
 *   # 2. écrire (par lots de 50)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/cv-completeness-catch-up.ts --workspace <uuid> --user <uuid> --appliquer --limite 50
 */
import { Queue } from 'bullmq'
import { bullConnectionOptions } from '../src/config/redis-connection'
import dataSource from '../src/database/data-source'
import { ConsultantEntity } from '../src/database/entities/consultant.entity'
import { CV_AUTO_PARSE_QUEUE } from '../src/modules/consultants/cv-auto-parse.queue'
import { CvAutoParseService } from '../src/modules/consultants/cv-auto-parse.service'
import {
  formatCompletenessCatchUpReport,
  runCompletenessCatchUp,
} from '../src/modules/consultants/cv-completeness-catch-up.runner'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const workspaceId = arg('workspace')
  const userId = arg('user')
  if (!workspaceId || !userId) throw new Error('Usage : --workspace <uuid> --user <uuid> [--appliquer] [--limite N]')
  const apply = process.argv.includes('--appliquer')
  const limitRaw = arg('limite')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  if (limit !== undefined && !Number.isFinite(limit)) throw new Error('--limite attend un nombre')

  await dataSource.initialize()
  // La simulation n'ouvre aucune connexion Redis : la file n'est créée que pour écrire.
  const queue = apply ? new Queue(CV_AUTO_PARSE_QUEUE, { connection: bullConnectionOptions() }) : null
  try {
    // Seuls la file et le dépôt de fiches servent ici (comptage + mise en file).
    /* eslint-disable no-restricted-syntax -- script ponctuel : le constructeur Nest exige des
       dépendances (lecteur IA, journal) que ni le comptage ni la mise en file n'utilisent. */
    const service = new CvAutoParseService(
      queue as never,
      null as never,
      null as never,
      dataSource.getRepository(ConsultantEntity),
      null as never,
    )
    /* eslint-enable no-restricted-syntax */
    const report = await runCompletenessCatchUp({ service, workspaceId, userId, apply, limit })
    process.stdout.write(`${formatCompletenessCatchUpReport(report)}\n`)
  } finally {
    await queue?.close()
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
