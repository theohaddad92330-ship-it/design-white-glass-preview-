/**
 * RATTRAPAGE du compte « Société Générale » dans les salles de démonstration
 * DÉJÀ semées — complément du 28/09/2026 (retour de démo de Théo).
 *
 * Applique EXACTEMENT les écritures du semis (`src/modules/demo/sg-csv-complement.ts`,
 * les mêmes fonctions — jamais une copie) sur le compte « Société Générale » de
 * CHAQUE espace `workspaces.is_demo = true` (le marqueur de `DemoPoolService`) :
 *
 *   1. `accounts.raw_analysis` — ajoute ce qui MANQUE, par identifiant ou par
 *      nom, sans rien remplacer (`mergeSgRawAnalysis`) : les 83 entités du
 *      graphe du groupe, les entités/programmes/technologies du CSV, les
 *      technologies comptées, la note des familles de métiers.
 *   2. `opportunities` — `ProjectsService.materialize` (la projection de
 *      production, idempotente) pour que les programmes ajoutés en 1 deviennent
 *      des pistes.
 *   3. `account_partners` (5 ESN employeuses) et `opportunities` (source,
 *      périmètre, rôle, détail des pistes reliées) — `applySgPartnersAndNeeds`.
 *   4. la piste complète (périmètre + rôle) qui porte « Préparer l'approche » — `applySgCompleteLead`.
 *
 * Idempotent : un second passage n'écrit rien (`ON CONFLICT DO NOTHING`,
 * `COALESCE`, ajout par clé absente). Une saisie humaine n'est jamais écrasée.
 * N'écrit JAMAIS hors d'un espace `is_demo` : la liste des comptes vient d'une
 * jointure sur `workspaces.is_demo`, et chaque écriture relit le couple
 * (compte, espace). Aucune personne des blocs 06/07/08 n'est écrite.
 *
 * Connexion : les variables standard de l'API (`POSTGRES_HOST`, `POSTGRES_PORT`,
 * `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `NODE_ENV`) via
 * `src/database/data-source.ts` — jamais affichées.
 *
 * Commandes (depuis la racine du dépôt) :
 *
 *   # 1. compter ce qui serait écrit, par espace et par table — n'écrit rien
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/demo-sg-complement.ts --dry-run
 *
 *   # 2. écrire
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only scripts/demo-sg-complement.ts
 *
 * Après l'écriture, recharger la page du compte dans la salle (le dossier est
 * relu à l'ouverture ; aucune file ni cache à vider).
 */
import dataSource from '../src/database/data-source'
import { ProjectEntity } from '../src/database/entities/project.entity'
import { ProjectsService } from '../src/modules/projects/projects.service'
import { DEMO_SG_COMPLETE_LEAD } from '../src/modules/demo/demo-dataset'
import {
  applySgCompleteLead,
  applySgPartnersAndNeeds,
  mergeSgRawAnalysis,
  type SgSqlExecutor,
} from '../src/modules/demo/sg-csv-complement'

const SG_COMPANY_NAME = 'Société Générale'

type DemoSgAccount = { workspace_id: string; account_id: string; raw_analysis: unknown }

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  await dataSource.initialize()
  try {
    const accounts = await dataSource.query<DemoSgAccount[]>(
      `SELECT a.workspace_id, a.id AS account_id, a.raw_analysis
         FROM accounts a
         JOIN workspaces w ON w.id = a.workspace_id
        WHERE w.is_demo = true
          AND a.company_name = $1
          AND a.status <> 'deleted'
        ORDER BY a.workspace_id`,
      [SG_COMPANY_NAME],
    )
    // eslint-disable-next-line no-console -- sortie attendue d'un script opérateur
    console.log(
      `${dryRun ? '[dry-run] ' : ''}${accounts.length} compte(s) « ${SG_COMPANY_NAME} » en salle de démonstration`,
    )

    for (const account of accounts) {
      await dataSource.transaction(async manager => {
        const exec: SgSqlExecutor = (sql, params) => manager.query(sql, params)
        const { merged, added } = mergeSgRawAnalysis(account.raw_analysis)
        const rawAdditions = Object.values(added).reduce((sum, count) => sum + count, 0)

        if (!dryRun && rawAdditions > 0) {
          await manager.query(
            `UPDATE accounts a
                SET raw_analysis = $3::jsonb
               FROM workspaces w
              WHERE a.id = $1 AND a.workspace_id = $2
                AND w.id = a.workspace_id AND w.is_demo = true`,
            [account.account_id, account.workspace_id, JSON.stringify(merged)],
          )
        }
        if (!dryRun) {
          // La projection de production, sur la même transaction.
          const projects = new ProjectsService(manager.getRepository(ProjectEntity))
          await projects.materialize(account.account_id)
        }

        const writes = await applySgPartnersAndNeeds(exec, account.workspace_id, account.account_id, { dryRun })
        const completeLead = await applySgCompleteLead(
          exec,
          account.workspace_id,
          account.account_id,
          DEMO_SG_COMPLETE_LEAD,
          dryRun,
        )
        const detail = Object.entries(added)
          .map(([key, count]) => `${key}=${count}`)
          .join(' ')
        // eslint-disable-next-line no-console -- sortie attendue d'un script opérateur
        console.log(
          `${dryRun ? '[dry-run] ' : ''}espace ${account.workspace_id} · compte ${account.account_id} — ` +
            `accounts.raw_analysis: ${detail} · account_partners: ${writes.partners} · opportunities (pistes complétées): ${writes.needs} · piste complète « Préparer l'approche »: ${completeLead}` +
            (dryRun && added['programNames']
              ? ` (+ jusqu'à ${added['programNames']} piste(s) « programme » créées puis complétées)`
              : ''),
        )
      })
    }
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  // Jamais l'objet d'erreur brut : un message pg peut citer des paramètres.
  console.error(
    'demo-sg-complement : échec —',
    error instanceof Error ? error.message.slice(0, 300) : 'erreur inconnue',
  )
  process.exit(1)
})
