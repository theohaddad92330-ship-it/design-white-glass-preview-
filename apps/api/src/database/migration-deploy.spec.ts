import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard the migration-on-deploy wiring.
 *
 * For hours today the API served a build from the morning while ten deploys in
 * a row silently failed, because nothing applied the pending migrations and,
 * separately, nothing ran the compiled artefact. This suite locks the two
 * decisions that keep migrations reaching production on every deploy:
 *
 *  1. Railway runs them **before** the container serves — a `preDeployCommand`.
 *     A failure ABORTS the deploy, keeping the previous image, instead of
 *     letting a missing column 500 live traffic. `migrationsRun` stays `false`
 *     in `database.module.ts` on purpose; this is the intended home.
 *
 *     ⚠️ Ce docblock affirmait « pre-deploy runs exactly once per deployment
 *     (not per replica, so no race) ». **La production a démontré le
 *     contraire le 31/08/2026** — déploiement `dd9b13fb` :
 *
 *         duplicate key value violates unique constraint "pg_type_typname_nsp_index"
 *         Key (typname, typnamespace)=(expense_reports, 48630) already exists.
 *         Migration "ExpenseReports1790970000001" failed
 *
 *     …alors que cette migration écrit `CREATE TABLE IF NOT EXISTS` et que la
 *     table n'existait pas. `IF NOT EXISTS` n'est pas atomique contre une
 *     création concurrente : deux sessions passent le test d'existence, l'une
 *     crée, l'autre tombe sur l'index unique de `pg_type`. Avec
 *     `restartPolicyMaxRetries: 10`, deux exécutions se chevauchent.
 *
 *     D'où le point 3 : les migrations passent désormais sous un verrou
 *     consultatif Postgres. Une hypothèse de non-concurrence écrite dans un
 *     commentaire n'est pas une garantie — celle-ci a coûté quatorze minutes
 *     de front neuf sur API ancienne.
 *
 *  2. The command runs the **compiled** data-source with the plain `typeorm`
 *     binary — NOT `typeorm-ts-node-commonjs` against `src/`. `ts-node` and
 *     `typescript` are devDependencies; Railway prunes them from the runtime
 *     image, so a `ts-node` form works locally and every CI check, then throws
 *     `Cannot find module 'ts-node'` in prod — invisible to the toolchain,
 *     which never runs the prod path. That is the exact blind spot that let
 *     the ESM-extension outage (#648) through.
 */

const API_DIR = join(__dirname, '..', '..')

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(API_DIR, relPath), 'utf8'))
}

/**
 * Le source, SANS ses commentaires.
 *
 * ⚠️ Écrit après que la première version de la garde ci-dessous soit passée au
 * VERT sur un fichier dont le verrou avait été retiré : elle cherchait le mot
 * `pg_advisory_lock`, et le trouvait dans le docblock qui l'explique. C'est la
 * forme la plus fréquente de garde borgne de ce dépôt — chercher un MOT sans
 * regarder s'il est du code ou de la prose. Une garde qui ne sait pas dire NON
 * est un test qui coûte du temps de CI et ne protège rien.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('migration deploy wiring', () => {
  const pkg = readJson('package.json')
  const scripts = (pkg['scripts'] ?? {}) as Record<string, string>
  const railway = readJson('railway.json')
  const deploy = (railway['deploy'] ?? {}) as Record<string, string>

  it('Railway runs migrations in a pre-deploy step, before serving', () => {
    // A missing pre-deploy command is the state that caused today's drift:
    // migrations only ever applied by someone remembering to run them by hand.
    expect(deploy['preDeployCommand']).toBeDefined()
    expect(deploy['preDeployCommand']).toMatch(/migration:run:prod/)
  })

  it('the prod migration command runs the COMPILED data-source, never ts-node', () => {
    const cmd = scripts['migration:run:prod']
    expect(cmd).toBeDefined()

    // La commande peut DÉLÉGUER à un script (le verrou consultatif du point 3).
    // On suit alors l'indirection et on garde la même règle sur ce qu'il
    // exécute vraiment — sinon la garde deviendrait aveugle au jour où
    // quelqu'un remet `ts-node` dans le script délégué.
    const delegated = cmd!.match(/node\s+(\S+\.mjs)/)
    const effective = delegated ? codeOnly(readFileSync(join(API_DIR, delegated[1]!), 'utf8')) : cmd!

    // Pure JS: the `typeorm` binary (a runtime dependency) against dist.
    expect(effective).toMatch(/\btypeorm\b/)
    expect(effective).toMatch(/dist\/database\/data-source\.js/)
    // The two ways it silently breaks in the pruned prod image.
    expect(effective).not.toMatch(/ts-node/)
    expect(effective).not.toMatch(/'src\/|\ssrc\//)
  })

  it('les migrations passent sous un VERROU — la course a été mesurée en prod', () => {
    // Le défaut du 31/08/2026 : deux exécutions concurrentes de `migration:run`
    // sur un `CREATE TABLE IF NOT EXISTS`, qui n'est pas atomique. Voir le
    // docblock. Sans verrou, le déploiement échoue une fois sur deux et
    // l'ancienne image continue de servir un front déjà remplacé.
    const cmd = scripts['migration:run:prod']!
    const delegated = cmd.match(/node\s+(\S+\.mjs)/)
    expect(delegated).not.toBeNull()
    const wrapper = codeOnly(readFileSync(join(API_DIR, delegated![1]!), 'utf8'))
    expect(wrapper).toMatch(/pg_try_advisory_lock/)
    expect(wrapper).toMatch(/pg_advisory_unlock/)
  })

  it("l'attente du verrou n'est JAMAIS bloquante — toutes les réplicas en dépendent", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // MESURÉ EN PRODUCTION LE 01/09/2026, déploiement de la vague 2
    // ─────────────────────────────────────────────────────────────────────────
    //   [migrate] verrou non obtenu après 120 s.
    //   error: canceling statement due to statement timeout   (code 57014)
    //
    // La première version attendait avec `pg_advisory_lock`, qui BLOQUE. Le
    // service tournait alors en SIX réplicas : une prend le verrou et migre,
    // les cinq autres se mettent en attente bloquante et meurent au
    // `statement_timeout` du serveur — alors qu'elles n'avaient rien à faire.
    //
    // Le compte a changé depuis (deux réplicas, `deploy.multiRegionConfig` de
    // `railway.json`) et il rechangera : l'invariant vaut dès la DEUXIÈME, il
    // ne dépend pas du chiffre. C'est aussi pourquoi la garde ne le lit pas.
    //
    // Deux invariants, et le second est celui qu'on oublie :
    //  1. la forme non bloquante (`pg_try_advisory_lock`), donc aucune
    //     instruction qui dure ;
    //  2. **on ne s'appuie plus sur `statement_timeout` pour borner l'attente**
    //     — on lui avait demandé dix minutes, le serveur a coupé à deux. Un
    //     réglage qu'on ne contrôle pas ne garde rien.
    const cmd = scripts['migration:run:prod']!
    const wrapper = codeOnly(readFileSync(join(API_DIR, cmd.match(/node\s+(\S+\.mjs)/)![1]!), 'utf8'))

    // La garde LIT quelque chose : un fichier vide passerait les deux tests.
    expect(wrapper.length).toBeGreaterThan(800)

    // La forme BLOQUANTE ne revient pas. `pg_try_advisory_lock` contient
    // `advisory_lock`, d'où la frontière de mot à gauche.
    expect(wrapper).not.toMatch(/(?<![_a-z])pg_advisory_lock\s*\(/)
    expect(wrapper).not.toMatch(/statement_timeout/)

    // L'attente vit dans une BOUCLE, là où on la contrôle.
    expect(wrapper).toMatch(/while\s*\(/)
  })

  it('le verrou lit la MÊME configuration de base que le migrateur', () => {
    // Défaut mesuré le 31/08/2026 : la première version du script supposait
    // `DATABASE_URL`, absente de cet environnement — le déploiement a échoué sur
    // « DATABASE_URL absent » au lieu de migrer. Et si la variable avait
    // EXISTÉ en pointant ailleurs, le verrou aurait gardé une base pendant que
    // TypeORM en migrait une autre : pire qu'un échec, un faux vert.
    //
    // Incident pool du 04/10/2026 — la configuration vit désormais à UN seul
    // endroit, `direct-connection.ts` : le migrateur (`data-source.ts`) l'appelle,
    // et le verrou charge sa version COMPILÉE. Même config par construction.
    const cmd = scripts['migration:run:prod']!
    const wrapper = codeOnly(readFileSync(join(API_DIR, cmd.match(/node\s+(\S+\.mjs)/)![1]!), 'utf8'))
    const dataSource = codeOnly(readFileSync(join(__dirname, 'data-source.ts'), 'utf8'))
    const resolver = codeOnly(readFileSync(join(__dirname, 'direct-connection.ts'), 'utf8'))
    expect(dataSource).toMatch(/resolveDirectConnection\(/)
    expect(wrapper).toMatch(/dist\/database\/direct-connection\.js/)
    expect(wrapper).toMatch(/resolveDirectConnection\(/)
    // Le résolveur lit bien les cinq variables de l'API (il sait dire NON : en
    // retirer une fait tomber la garde).
    for (const variable of ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
      expect(resolver).toContain(`'${variable}'`)
    }
    // Ni le migrateur ni le verrou ne relisent l'env de leur côté.
    expect(dataSource).not.toMatch(/process\.env\[?'POSTGRES_/)
    expect(wrapper).not.toMatch(/process\.env\.POSTGRES_/)
    expect(wrapper).not.toMatch(/DATABASE_URL/)
  })

  it('incident 04/10 — migrations et verrou HORS du pooler transaction, réglages de session posés', () => {
    // Un verrou de SESSION via Supavisor en mode transaction (6543) n'est pas
    // fiable, et le client de migration y prenait une place du pool saturé.
    const cmd = scripts['migration:run:prod']!
    const wrapper = codeOnly(readFileSync(join(API_DIR, cmd.match(/node\s+(\S+\.mjs)/)![1]!), 'utf8'))
    const dataSource = codeOnly(readFileSync(join(__dirname, 'data-source.ts'), 'utf8'))
    // La session de migration reçoit lock_timeout court + statement_timeout levé,
    // seulement quand la connexion directe est configurée (sinon : inchangé).
    expect(dataSource).toMatch(/onConnect/)
    expect(dataSource).toMatch(/applyDirectSessionSettings/)
    expect(dataSource).toMatch(/\.direct\b/)
    // Sans variable directe : on migre comme avant, mais on le DIT.
    expect(wrapper).toMatch(/directConnectionWarning\(/)
    // Un échec de connexion ou de migration nomme sa cause probable.
    expect(wrapper).toMatch(/lock timeout/i)
  })

  it('the app still does NOT auto-run migrations at boot (pre-deploy owns it)', () => {
    // If both ran, two mechanisms would race and a boot-time failure would
    // crash-loop the app instead of aborting the deploy cleanly.
    const moduleSrc = readFileSync(join(__dirname, 'database.module.ts'), 'utf8')
    expect(moduleSrc).toMatch(/migrationsRun:\s*false/)
  })
})
