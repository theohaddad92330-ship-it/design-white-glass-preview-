/**
 * #4559 — SIGNALEMENT (lecture seule) des identifiants étrangers stockés avant la
 * garde d'écriture : `consultants.manager_id`, `missions.opportunity_id`,
 * `missions.need_id` qui pointent vers une ligne d'un AUTRE espace.
 *
 * N'écrit RIEN, n'efface RIEN, n'affiche aucun identifiant : des comptes par cas.
 * La reprise éventuelle de ces lignes est une décision à part.
 *
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/foreign-reference-audit.ts
 */
import dataSource from '../src/database/data-source'
import {
  formatForeignReferenceReport,
  runForeignReferenceAudit,
  sqlForeignReferencePort,
} from '../src/modules/workspace/foreign-reference-audit'

async function main(): Promise<void> {
  await dataSource.initialize()
  try {
    const report = await runForeignReferenceAudit(sqlForeignReferencePort(dataSource.manager))
    process.stdout.write(`${formatForeignReferenceReport(report)}\n`)
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
