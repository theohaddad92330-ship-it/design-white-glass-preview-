/**
 * #3883 — rattrapage du stock — RATTRAPAGE DU STOCK de CV jamais lus, TOUS espaces confondus
 * (décision Louis 10/10 : « rattraper l'existant de TOUS les utilisateurs »).
 *
 * Les CV importés avant la lecture automatique (`CvAutoParseService.enqueue`) n'ont jamais été
 * lus. Ce script met leurs fiches en file BullMQ, à débit borné (`--espacement`, 20 s par
 * défaut : un `delay` croissant par fiche, la file lit une fiche à la fois) — jamais de pic sur
 * l'API. Aucun crédit débité. Ne touche JAMAIS une fiche lue, qualifiée, archivée, ni corrigée
 * à la main. Déclenché À LA MAIN, jamais au déploiement.
 *
 * SIMULATION par défaut (compte, par espace, ce qui partirait ; n'écrit rien). Écriture
 * seulement avec `--appliquer`. Idempotent et reprenable : une fiche lue sort de la sélection,
 * une fiche déjà en file n'est pas doublée ; `--limite N` découpe en lots.
 *
 * Connexion : variables standard de l'API (POSTGRES_*, REDIS_URL) — jamais affichées.
 *
 *   # 1. simulation (n'écrit rien)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/cv-stock-catch-up.ts
 *
 *   # 2. écrire (par lots de 200, une lecture toutes les 20 s)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/cv-stock-catch-up.ts --appliquer --limite 200
 */
import { Queue } from 'bullmq'
import { bullConnectionOptions } from '../src/config/redis-connection'
import dataSource from '../src/database/data-source'
import { ConsultantEntity } from '../src/database/entities/consultant.entity'
import { CV_AUTO_PARSE_QUEUE } from '../src/modules/consultants/cv-auto-parse.queue'
import { CvAutoParseService } from '../src/modules/consultants/cv-auto-parse.service'
import {
  formatStockCatchUpReport,
  runStockCatchUp,
  STOCK_CATCH_UP_SPACING_MS,
} from '../src/modules/consultants/cv-stock-catch-up.runner'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function numberArg(name: string): number | undefined {
  const raw = arg(name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} attend un nombre positif`)
  return value
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer')
  const limit = numberArg('limite')
  const spacingSeconds = numberArg('espacement')
  const spacingMs = spacingSeconds === undefined ? STOCK_CATCH_UP_SPACING_MS : spacingSeconds * 1000

  await dataSource.initialize()
  // La simulation n'ouvre aucune connexion Redis : la file n'est créée que pour écrire.
  const queue = apply ? new Queue(CV_AUTO_PARSE_QUEUE, { connection: bullConnectionOptions() }) : null
  try {
    // Seuls la file et le dépôt de fiches servent ici (sélection + mise en file).
    /* eslint-disable no-restricted-syntax -- script ponctuel : le constructeur Nest exige des
       dépendances (lecteur IA, journal) que ni la sélection ni la mise en file n'utilisent. */
    const service = new CvAutoParseService(
      queue as never,
      null as never,
      null as never,
      dataSource.getRepository(ConsultantEntity),
      null as never,
    )
    /* eslint-enable no-restricted-syntax */
    const report = await runStockCatchUp({ service, apply, ...(limit === undefined ? {} : { limit }), spacingMs })
    process.stdout.write(`${formatStockCatchUpReport(report)}\n`)
  } finally {
    await queue?.close()
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
