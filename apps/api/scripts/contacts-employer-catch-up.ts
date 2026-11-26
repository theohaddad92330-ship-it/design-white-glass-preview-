/**
 * #4928.4 — rattraper la garde d'employeur sur les contacts DÉJÀ en base (décision Louis 18/09/2026 : ciblé,
 * par segment, jamais au déploiement). Déclenché À LA MAIN, par un humain, pour UN espace ou UN compte.
 * SIMULATION par défaut : affiche le compte avant d'écrire. Écrire exige `--appliquer --confirmer <N>`, N étant le
 * compte AFFICHÉ par la simulation. Reprenable : `--apres <accountId>` (dernier compte du rapport).
 *
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only \
 *     scripts/contacts-employer-catch-up.ts --compte <accountId>                        # simulation
 *   ... scripts/contacts-employer-catch-up.ts --compte <accountId> --appliquer --confirmer 12
 *
 * Connexion : variables standard de l'API (POSTGRES_*) — jamais affichées. NON LANCÉ par le lot qui l'a écrit.
 */
import dataSource from '../src/database/data-source'
import { AccountEntity } from '../src/database/entities/account.entity'
import { ContactEntity } from '../src/database/entities/contact.entity'
import { runContactsEmployerCatchUp } from '../src/modules/contacts/contacts-employer-catch-up.runner'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer') && !process.argv.includes('--simulation')
  const confirmed = arg('confirmer')
  await dataSource.initialize()
  try {
    const report = await runContactsEmployerCatchUp({
      accounts: dataSource.getRepository(AccountEntity),
      contacts: dataSource.getRepository(ContactEntity),
      apply,
      workspaceId: arg('espace'),
      accountId: arg('compte'),
      afterAccountId: arg('apres'),
      confirmedCount: confirmed === undefined ? undefined : Number(confirmed),
    })
    process.stdout.write(
      `${apply ? 'ÉCRIT' : 'SIMULATION (rien écrit)'} — ${report.concerned} compte(s) concerné(s), ${report.toArchive} contact(s) à écarter, ${report.archived} écarté(s)\n` +
        `${report.lines.join('\n')}\nDernier compte : ${report.lastAccountId ?? '—'}\n`,
    )
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
