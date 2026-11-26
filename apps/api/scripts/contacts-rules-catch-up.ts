/**
 * LUDOVIC-C LC.1 (b) — remettre les contacts DÉJÀ collectés aux règles actuelles (homonymes
 * archivés avec leur raison, jamais supprimés, jamais un contact corrigé par un humain), pour
 * UN espace ou UN compte. Sans recollecte, sans crédit. Déclenché À LA MAIN, jamais au
 * déploiement. SIMULATION par défaut (`--simulation` implicite) ; écriture avec `--appliquer`.
 *
 *   railway run --service belllum-backend-service -- pnpm --filter api exec ts-node --transpile-only \
 *     scripts/contacts-rules-catch-up.ts --compte <accountId>            # simulation
 *   ... scripts/contacts-rules-catch-up.ts --espace <workspaceId> --appliquer
 *
 * Connexion : variables standard de l'API (POSTGRES_*) — jamais affichées.
 */
import dataSource from '../src/database/data-source'
import { AccountEntity } from '../src/database/entities/account.entity'
import { ContactEntity } from '../src/database/entities/contact.entity'
import { runContactsRulesCatchUp } from '../src/modules/contacts/contacts-rules-catch-up.runner'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--appliquer') && !process.argv.includes('--simulation')
  await dataSource.initialize()
  try {
    const report = await runContactsRulesCatchUp({
      accounts: dataSource.getRepository(AccountEntity),
      contacts: dataSource.getRepository(ContactEntity),
      apply,
      workspaceId: arg('espace'),
      accountId: arg('compte'),
    })
    process.stdout.write(
      `${apply ? 'ÉCRIT' : 'SIMULATION (rien écrit)'} — ${report.concerned} compte(s) concerné(s), ${report.archived} homonyme(s)\n${report.lines.join('\n')}\n`,
    )
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
