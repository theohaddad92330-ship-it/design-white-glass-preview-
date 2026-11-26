/**
 * RATTRAPAGE du compte « Groupe BPCE » dans les salles de démonstration DÉJÀ
 * semées (30/09/2026) : `DemoSeedService.seedWorkspace` est idempotent sur la
 * seule présence d'un compte, donc le septième dossier n'y arrive jamais seul.
 *
 * Pour CHAQUE espace `workspaces.is_demo = true` qui n'a pas encore le compte,
 * écrit EXACTEMENT ce que le semis écrit (`DemoSeedService.catchUpMissingDossier` :
 * compte, contacts, entités, angles, plan, pistes, ESN présentes — aucune copie).
 * Idempotent : un espace qui a déjà le compte n'est pas touché. N'écrit jamais
 * hors d'un espace `is_demo` ; le propriétaire est celui de l'espace.
 *
 * Connexion : variables standard de l'API via `src/database/data-source.ts`,
 * jamais affichées.
 *
 *   # 1. compter les espaces concernés — n'écrit rien
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/demo-bpce-complement.ts --dry-run
 *
 *   # 2. écrire
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/demo-bpce-complement.ts
 *
 * Une salle DÉJÀ ouverte recharge ses comptes à l'ouverture suivante.
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import dataSource from '../src/database/data-source'
import { DEMO_BPCE_REAL_CONTACTS_COMPANY } from '../src/modules/demo/bpce-csv-mapping'
import { DemoSeedService } from '../src/modules/demo/demo-seed.service'

type DemoRoom = { workspace_id: string; owner_user_id: string }

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  await dataSource.initialize()
  const rooms = await dataSource.query<DemoRoom[]>(
    `SELECT w.id AS workspace_id, w.owner_user_id
       FROM workspaces w
      WHERE w.is_demo = true
        AND NOT EXISTS (
          SELECT 1 FROM accounts a
           WHERE a.workspace_id = w.id AND a.company_name = $1 AND a.status <> 'deleted')
      ORDER BY w.id`,
    [DEMO_BPCE_REAL_CONTACTS_COMPANY],
  )
  // eslint-disable-next-line no-console -- sortie attendue d'un script opérateur
  console.log(
    `${dryRun ? '[dry-run] ' : ''}${rooms.length} salle(s) de démonstration sans « ${DEMO_BPCE_REAL_CONTACTS_COMPANY} »`,
  )
  await dataSource.destroy()
  if (dryRun || rooms.length === 0) return

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  try {
    const seed = app.get(DemoSeedService)
    for (const room of rooms) {
      const result = await seed.catchUpMissingDossier(
        room.workspace_id,
        room.owner_user_id,
        DEMO_BPCE_REAL_CONTACTS_COMPANY,
      )
      // eslint-disable-next-line no-console -- sortie attendue d'un script opérateur
      console.log(`espace ${room.workspace_id} — ${result.seeded ? 'compte écrit' : 'déjà présent'}`)
    }
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  // Jamais l'objet d'erreur brut : un message pg peut citer des paramètres.
  console.error(
    'demo-bpce-complement : échec —',
    error instanceof Error ? error.message.slice(0, 300) : 'erreur inconnue',
  )
  process.exit(1)
})
