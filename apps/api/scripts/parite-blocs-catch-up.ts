/**
 * #4078 — RATTRAPAGE des cinq blocs du dossier complet (01 axes de lecture, 14
 * écosystème, 15 domaines d'opportunité, 16 indicateurs financiers, 17
 * fiabilité) sur les comptes analysés AVANT la capacité (doctrine « un correctif
 * de collecte rattrape l'existant », Louis 18/09/2026).
 *
 * Ciblé (date de collecte du segment `dossier_blocks_collected_at` absente ou
 * antérieure à `SEGMENT_CAPABILITY_EPOCH.dossier_blocks`, hors espaces de
 * démonstration — la même date que le bandeau de la Synthèse), par segment (`DossierBlocksStep` SEULE, jamais une
 * analyse entière, aucun crédit débité), jamais d'écrasement (seules les clés
 * absentes s'écrivent : un import ou une correction humaine restent). Déclenché
 * À LA MAIN, jamais au déploiement.
 *
 * SIMULATION par défaut (compte ce qui partirait ; n'écrit rien, n'appelle aucun
 * modèle). Écriture seulement avec `--appliquer`. Reprenable : `--apres <id>`,
 * `--limite N` (50 par défaut), `--espace <id>` pour un seul espace.
 *
 * Connexion : variables standard de l'API (POSTGRES_*, IA_SERVICE_URL,
 * INTERNAL_API_SECRET) — jamais affichées.
 *
 *   # 1. simulation (n'écrit rien)
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/parite-blocs-catch-up.ts
 *
 *   # 2. écrire, par lots
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/parite-blocs-catch-up.ts --appliquer --limite 50
 */
import { ConfigService } from '@nestjs/config'
import dataSource from '../src/database/data-source'
import type { CorrelationIdService } from '../src/correlation-id/correlation-id.service'
import { IaClient } from '../src/modules/ia/ia.client'
import { runDossierBlocksCatchUp } from '../src/modules/analysis/dossier-blocks-catch-up.runner'
import { DossierBlocksStep } from '../src/modules/analysis/dossier-blocks.step'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function formatReport(report: Awaited<ReturnType<typeof runDossierBlocksCatchUp>>): string {
  const head = report.apply
    ? 'Rattrapage des blocs du dossier — ÉCRITURE'
    : 'Rattrapage des blocs du dossier — SIMULATION (rien écrit)'
  const lines = [head, `Comptes ciblés : ${report.candidates}`]
  if (report.apply) lines.push(`Issues : ${JSON.stringify(report.outcomes)}`)
  if (report.lastId) lines.push(`Reprendre après : --apres ${report.lastId}`)
  return lines.join('\n')
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer')
  const rawLimit = arg('limite')
  const limit = rawLimit === undefined ? undefined : Number(rawLimit)
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0))
    throw new Error('--limite attend un nombre positif')

  await dataSource.initialize()
  try {
    const config = new ConfigService({
      iaServiceUrl: process.env.IA_SERVICE_URL,
      internalApiSecret: process.env.INTERNAL_API_SECRET,
    })
    const correlation = { getCorrelationId: () => undefined } as unknown as CorrelationIdService
    const step = new DossierBlocksStep(new IaClient(config, correlation), dataSource)
    const report = await runDossierBlocksCatchUp({
      dataSource,
      step,
      apply,
      ...(limit === undefined ? {} : { limit }),
      ...(arg('espace') ? { workspaceId: arg('espace') } : {}),
      ...(arg('apres') ? { afterId: arg('apres') } : {}),
    })
    process.stdout.write(`${formatReport(report)}\n`)
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
