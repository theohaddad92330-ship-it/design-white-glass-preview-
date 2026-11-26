#!/usr/bin/env node
/**
 * Lance les migrations SOUS UN VERROU consultatif Postgres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION — 31/08/2026, déploiement `dd9b13fb`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le déploiement a ÉCHOUÉ, l'ancienne API a continué de servir, et le front
 * Vercel — déployé en une minute, lui — appelait des routes qui n'existaient pas
 * encore : `GET /accounts/entities/billing-profiles → 404`. Pendant quatorze
 * minutes, l'application tournait dans un état qui n'existe nulle part
 * durablement : un front neuf sur une API ancienne.
 *
 * L'erreur exacte :
 *
 *     duplicate key value violates unique constraint "pg_type_typname_nsp_index"
 *     Key (typname, typnamespace)=(expense_reports, 48630) already exists.
 *     Migration "ExpenseReports1790970000001" failed
 *
 * Or cette migration écrit `CREATE TABLE IF NOT EXISTS`, et la table n'existait
 * pas. **`IF NOT EXISTS` n'est PAS atomique contre une création concurrente** :
 * deux sessions passent le test d'existence en même temps, l'une crée, l'autre
 * tombe sur l'index unique de `pg_type`. C'est le symptôme documenté, et il ne
 * se répare pas en réécrivant la migration — la suivante retomberait dedans.
 *
 * Le service tourne en PLUSIEURS RÉPLICAS (les journaux le disent :
 * « Cron 'status-monitor' skipped — another replica holds this tick's lock »),
 * et `restartPolicyMaxRetries: 10` rejoue le pré-déploiement. Deux exécutions
 * concurrentes de `migration:run` suffisent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REMÈDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un verrou consultatif sérialise les exécutions : la seconde attend la
 * première, puis constate que les migrations sont déjà passées et ne fait rien.
 * Le verrou est pris sur la connexion, et Postgres le relâche tout seul si le
 * processus meurt — un conteneur tué ne laisse donc pas un verrou orphelin qui
 * bloquerait tous les déploiements suivants.
 *
 * ⚠️ Le verrou est pris sur une connexion DÉDIÉE, pas sur celle de TypeORM :
 * un verrou consultatif est lié à la session, et TypeORM ouvre puis referme la
 * sienne au fil des migrations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SECOND DÉFAUT — celui de la PREMIÈRE version de ce script, 01/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette version-là attendait avec `pg_advisory_lock`, qui BLOQUE. Mesuré au
 * déploiement de la vague 2 :
 *
 *     [migrate] demande du verrou 778931204…
 *     [migrate] verrou non obtenu après 120 s.
 *     error: canceling statement due to statement timeout   (code 57014)
 *
 * Deux choses, et la seconde est la vraie.
 *
 * 1. Le `statement_timeout` de dix minutes passé au client **n'a pas été
 *    honoré** : le serveur a coupé à 120 s. On ne s'appuie donc plus dessus.
 *
 * 2. Surtout : **le service tourne en SIX réplicas**, et chacun lance le
 *    pré-déploiement. Un prend le verrou et migre ; les cinq autres se mettent
 *    en attente BLOQUANTE et meurent tous au bout de 120 s — alors qu'ils
 *    n'avaient rien à faire, puisque le premier faisait le travail.
 *
 * Un `SELECT pg_advisory_lock()` est une instruction bloquante : elle tombe
 * sous le `statement_timeout`. `pg_try_advisory_lock` rend la main
 * immédiatement, donc aucune instruction ne dure. On BOUCLE dessus avec de
 * courtes pauses au lieu d'attendre dans une seule requête.
 *
 * ⚠️ Le réplica qui finit par obtenir le verrou APRÈS le migrateur ne trouve
 * rien à faire : TypeORM lit sa table `migrations` et sort. C'est ce qui rend
 * la boucle sûre — on ne suppose pas que l'autre a fini, on le VÉRIFIE en
 * refaisant le geste, qui est idempotent.
 */

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROISIÈME DÉFAUT — incident pool du 04/10/2026 (soir)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce client et TypeORM passaient par le pooler Supavisor en mode TRANSACTION
 * (port 6543). Deux conséquences mesurées :
 *  - le verrou « obtenu après 5 s » ne protégeait rien : un verrou de SESSION
 *    via un pooler transaction change de backend entre deux requêtes ;
 *  - le pool Supavisor saturé par l'API, la migration a échoué
 *    (« canceling statement due to statement timeout », puis
 *    « authentication did not complete within 15000ms ») — plus aucun
 *    déploiement possible pour réparer.
 * Désormais le verrou ET le migrateur lisent `dist/database/direct-connection.js`
 * (une seule configuration, celle de `data-source.ts`) : avec
 * `POSTGRES_DIRECT_PORT` (5432 = mode session), tous deux passent HORS du pooler
 * transaction, et la session de migration porte `lock_timeout` court. Sans la
 * variable : comportement inchangé, avertissement explicite.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import pg from 'pg'

const require = createRequire(import.meta.url)
// Le module COMPILÉ, comme `dist/database/data-source.js` que lance TypeORM.
const { resolveDirectConnection, directConnectionWarning } = require('../dist/database/direct-connection.js')

/**
 * La clé du verrou. Un entier arbitraire mais STABLE : deux déploiements doivent
 * demander le même, sinon ils ne s'attendent pas. Ne jamais la changer.
 */
const LOCK_KEY = 778_931_204

/**
 * Le budget TOTAL d'attente du verrou, tenu par la BOUCLE et non par une
 * instruction.
 *
 * ⚠️ Il ne se règle PAS avec `statement_timeout` : mesuré le 01/09/2026, le
 * serveur a coupé à 120 s une requête à qui on avait demandé dix minutes. Un
 * réglage qu'on ne contrôle pas ne garde rien.
 *
 * Dimensionné sur le pire cas observé : douze migrations en un peu plus de
 * deux minutes, six réplicas. Le dernier arrivé doit pouvoir attendre que le
 * premier finisse, avec de la marge — et échouer BRUYAMMENT au-delà, plutôt
 * que de laisser un déploiement pendre sans que personne ne sache pourquoi.
 */
const WAIT_BUDGET_MS = 10 * 60 * 1000

/**
 * L'intervalle entre deux tentatives.
 *
 * Assez court pour que le réplica suivant démarre vite après la libération,
 * assez long pour ne pas marteler la base pendant dix minutes. Chaque tentative
 * est une requête qui rend la main immédiatement.
 */
const RETRY_INTERVAL_MS = 2_000

async function main() {
  // ⚠️ Les MÊMES variables que `dist/database/data-source.js`, et pas
  // `DATABASE_URL`. Première version de ce script : elle supposait
  // `DATABASE_URL`, absent de cet environnement — le déploiement a échoué sur
  // « DATABASE_URL absent » au lieu de migrer. Un verrou qui lit une autre
  // configuration que le migrateur ne garde rien : il verrouillerait une base,
  // et TypeORM en migrerait une autre.
  //
  // Incident 04/10/2026 — la résolution vit dans `direct-connection.ts`, lue
  // aussi par `data-source.ts` : jamais deux lectures de l'env qui divergent.
  const connection = resolveDirectConnection()
  const warning = directConnectionWarning(connection)
  if (warning) console.warn(`[migrate] ⚠️ ${warning}`)
  else console.log(`[migrate] connexion directe/session (port ${connection.port}), hors du pooler transaction.`)

  const client = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl,
    // Un pooler saturé ne doit pas faire pendre le pré-déploiement sans rien dire.
    connectionTimeoutMillis: 30_000,
  })

  try {
    await client.connect()
  } catch (error) {
    console.error(
      `[migrate] connexion à Postgres impossible (port ${connection.port}) : ${error?.message ?? error}. ` +
        "Rien n'a été tenté. Si le message parle d'authentification ou de checkout après 15000ms, " +
        'le pool Supavisor est saturé (incident du 04/10/2026) : poser POSTGRES_DIRECT_PORT=5432 ' +
        'pour migrer hors du pooler transaction, et vérifier DB_POOL_MAX × réplicas.',
    )
    process.exit(1)
  }
  const startedAt = Date.now()
  console.log(`[migrate] demande du verrou ${LOCK_KEY}…`)

  // ⚠️ `pg_try_advisory_lock` et non `pg_advisory_lock` : la première rend la
  // main tout de suite, la seconde BLOQUE — et une instruction bloquante tombe
  // sous le `statement_timeout` du serveur, qui a coupé à 120 s le 01/09/2026.
  // L'attente vit donc dans la boucle, où on la contrôle.
  let acquired = false
  let attempts = 0
  while (Date.now() - startedAt < WAIT_BUDGET_MS) {
    attempts += 1
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS taken', [LOCK_KEY])
    if (rows[0]?.taken === true) {
      acquired = true
      break
    }
    if (attempts === 1) {
      console.log('[migrate] un autre réplica migre — on attend son tour sans le bousculer.')
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
  }

  if (!acquired) {
    const waitedS = Math.round((Date.now() - startedAt) / 1000)
    console.error(
      `[migrate] verrou toujours pris après ${waitedS} s et ${attempts} tentatives. ` +
        "Rien n'a été tenté. Un déploiement précédent est peut-être bloqué : " +
        `vérifier \`SELECT * FROM pg_locks WHERE locktype = 'advisory' AND objid = ${LOCK_KEY}\`.`,
    )
    await client.end().catch(() => {})
    process.exit(1)
  }

  const waited = Math.round((Date.now() - startedAt) / 1000)
  console.log(
    `[migrate] verrou obtenu après ${waited} s (${attempts} tentative${attempts > 1 ? 's' : ''}) — ` +
      'exécution des migrations. Si un autre réplica vient de les passer, TypeORM le constatera et ne fera rien.',
  )

  const code = await run('pnpm', [
    '--filter',
    '@bellum/api',
    'exec',
    'typeorm',
    'migration:run',
    '-d',
    'dist/database/data-source.js',
  ])

  // Relâcher explicitement : Postgres le ferait à la fermeture de session, mais
  // un verrou rendu tôt raccourcit l'attente du réplica suivant.
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
  await client.end().catch(() => {})

  if (code !== 0) {
    console.error(
      `[migrate] migrations en ÉCHEC (code ${code}). Le déploiement doit s'arrêter ici. ` +
        'Si TypeORM a écrit « canceling statement due to lock timeout » : une session tient un verrou sur la ' +
        'table migrée (transaction longue, purge démo) — la migration a refusé de faire la queue au bout de 10 s ' +
        "plutôt que de bloquer toute l'API derrière elle. Lire pg_stat_activity, puis redéployer.",
    )
    process.exit(code)
  }
  console.log('[migrate] migrations terminées.')
}

function run(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.on('close', resolve)
    child.on('error', error => {
      console.error('[migrate] impossible de lancer les migrations', error)
      resolve(1)
    })
  })
}

main().catch(error => {
  console.error('[migrate] échec inattendu', error)
  process.exit(1)
})
