#!/usr/bin/env node
/**
 * Convertit un dossier RÉELLEMENT analysé en entrée du jeu de démonstration.
 *
 * Pourquoi une conversion mécanique. Les dossiers de démonstration portent des
 * sociétés réelles (décision Louis, 10/08/2026). Les écrire à la main
 * produirait des phrases plausibles et invérifiables sur des entreprises
 * identifiables, sur un lien PUBLIC. La seule source honnête est ce que le
 * produit PRODUIT vraiment : on lance une analyse, et on capture sa sortie.
 *
 * Ce que le script fait : lire les quatre tables qu'un run remplit (`accounts`,
 * `contacts`, `attack_angles`, `action_plans`) et rendre le littéral TypeScript
 * attendu par `demo-dataset.ts`.
 *
 * Ce qu'il fait AUSSI, et qui est le vrai sujet : **retirer les coordonnées
 * nominatives**. Un run réel enrichit de vrais courriels et de vrais numéros de
 * personnes réelles ; les publier sur un lien ouvert serait une diffusion de
 * données personnelles. Les fiches gardent le nom, la fonction et le
 * raisonnement — ce qui fait la démonstration — et perdent ce qui permettrait
 * de contacter quelqu'un.
 *
 * Usage :
 *   node scripts/demo-dossier-from-run.mjs <accountId> [...] > dossiers.json
 *
 * Connexion : les variables PG standard (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
 * ou POSTGRES_* comme `tools/dev.secret.sh` les pose.
 */

import { createRequire } from 'node:module'

const require = createRequire(`${process.cwd()}/apps/api/`)
const { Client } = require('pg')

/** Nombre de contacts gardés par dossier. Un run réel en rend des centaines ;
 *  la démonstration en montre les mieux classés — au-delà, l'écran ne se lit
 *  plus et le jeu de données devient impubliable. */
const CONTACT_LIMIT = 12

/** Les colonnes de contact qui portent une coordonnée. Retirées, sans exception :
 *  voir l'en-tête. La liste est explicite plutôt que déduite d'un motif — un
 *  motif oublierait la prochaine colonne ajoutée, et le silence irait dans le
 *  mauvais sens. */
const CONTACT_PII_COLUMNS = ['email', 'phone', 'mobile_phone', 'direct_phone', 'linkedin_url', 'photo_url']

function connectionConfig() {
  return {
    host: process.env.PGHOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? process.env.POSTGRES_PORT ?? 5432),
    user: process.env.PGUSER ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? '',
    database: process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? 'postgres',
  }
}

/** Retire les coordonnées d'une fiche contact et signale ce qui a été retiré —
 *  un retrait silencieux se lirait plus tard comme « le run n'a rien trouvé ». */
function stripContactPii(contact) {
  const removed = []
  const out = { ...contact }
  for (const column of CONTACT_PII_COLUMNS) {
    if (out[column] !== undefined && out[column] !== null && out[column] !== '') removed.push(column)
    if (column in out) out[column] = null
  }
  return { contact: out, removed }
}

async function main() {
  const accountIds = process.argv.slice(2)
  if (accountIds.length === 0) {
    console.error('Usage : node scripts/demo-dossier-from-run.mjs <accountId> [...]')
    process.exit(1)
  }

  const client = new Client(connectionConfig())
  await client.connect()

  const dossiers = []
  const removedByAccount = {}

  for (const accountId of accountIds) {
    const { rows: accounts } = await client.query('SELECT * FROM accounts WHERE id = $1', [accountId])
    const account = accounts[0]
    if (!account) {
      console.error(`⚠️  compte introuvable : ${accountId}`)
      continue
    }
    if (account.status !== 'completed') {
      // Un dossier en erreur ou en cours n'a pas de sortie complète : le
      // capturer produirait un dossier de démonstration à trous.
      console.error(`⚠️  ${account.company_name} : statut « ${account.status} » — non capturé.`)
      continue
    }

    const { rows: contacts } = await client.query(
      'SELECT * FROM contacts WHERE account_id = $1 ORDER BY COALESCE(contact_score, 0) DESC, priority ASC NULLS LAST LIMIT $2',
      [accountId, CONTACT_LIMIT],
    )
    const { rows: angles } = await client.query(
      'SELECT * FROM attack_angles WHERE account_id = $1 ORDER BY rank ASC NULLS LAST',
      [accountId],
    )
    const { rows: plans } = await client.query(
      'SELECT * FROM action_plans WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [accountId],
    )

    const cleaned = contacts.map(stripContactPii)
    removedByAccount[account.company_name] = [...new Set(cleaned.flatMap(c => c.removed))]

    dossiers.push({
      account,
      contacts: cleaned.map(c => c.contact),
      attackAngles: angles,
      actionPlan: plans[0] ?? null,
      // La FRAÎCHEUR voyage avec le dossier : une démonstration ne doit jamais
      // laisser croire qu'un chiffre de l'an dernier a été collecté ce matin.
      capturedFrom: { accountId, analyzedAt: account.updated_at },
    })

    console.error(
      `✓ ${account.company_name} — ${cleaned.length} contact(s), ${angles.length} angle(s), ` +
        `${plans.length} plan(s), coordonnées retirées : ${removedByAccount[account.company_name].join(', ') || 'aucune'}`,
    )
  }

  await client.end()
  process.stdout.write(`${JSON.stringify({ capturedAt: new Date().toISOString(), dossiers }, null, 1)}\n`)
}

main().catch(error => {
  console.error('Capture interrompue :', error)
  process.exit(1)
})
