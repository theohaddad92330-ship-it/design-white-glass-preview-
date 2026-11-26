/**
 * #balayage-weekly-digest — 15/09/2026, croisement demandé par l'intégrateur
 * pendant la reprise : l'entité `NotificationPreferenceEntity` portait
 * `weekly_digest` / `newsletter_changelog` en `default: true` alors que
 * `1792800260000-NotificationOutboundDefaultsOff` avait déjà mis le DEFAULT
 * **SQL** à `false`. Est-ce que TypeORM écrit malgré tout `true` sur un
 * `.insert()` qui omet la colonne — auquel cas le « robinet précoché » serait
 * encore ouvert aujourd'hui ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE, CONTRE UN VRAI POSTGRES MIGRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `ChangelogNewsletterService.stampMarker` (changelog-newsletter.service.ts:322)
 * fait exactement `this.prefs.insert({ user_id, newsletter_last_entry_id })` —
 * deux colonnes, rien d'autre. Ce test rejoue le MÊME appel (`.insert()` sur
 * le repository TypeORM réel, contre une table migrée par les 278 migrations
 * du dépôt, jamais `synchronize: true`) et lit `weekly_digest` /
 * `newsletter_changelog` en retour : `false` prouve que Postgres a rempli la
 * colonne depuis SON propre DEFAULT, jamais depuis `column.default` de
 * l'entité (qui valait encore `true` avant le correctif du même lot).
 *
 * Preuve statique complémentaire, lisible sans base : le driver postgres de
 * `InsertQueryBuilder` (`node_modules/typeorm/query-builder/InsertQueryBuilder.js`,
 * la branche `value === undefined` vers la ligne 571) émet le mot-clé SQL
 * littéral `DEFAULT` pour une colonne absente du `values` — le repli sur
 * `column.default` (ligne ~995) n'existe que pour sqlite/sap/spanner/oracle
 * multi-lignes, jamais pour `type: 'postgres'` (`data-source.ts:14`). Ce test
 * est la preuve EXÉCUTABLE de la même conclusion.
 *
 * OPT-IN, comme `access-summary.db.spec.ts` : `PG_TEST_URL` (ou
 * `RAG_DB_TEST`) posé + `pnpm migration:run` déjà joué. L'interrupteur est lu
 * SYNCHRONEMENT avant que `describe` ne choisisse `it` vs `it.skip` — une
 * base injoignable avec l'interrupteur posé fait ÉCHOUER le run, jamais
 * silencieusement passer.
 *
 *   set -a; . tools/dev.secret.sh; set +a
 *   PG_TEST_URL="postgresql://postgres:$POSTGRES_PASSWORD@localhost:5440/postgres" \
 *     npx jest src/modules/notifications/weekly-digest-insert-default.db
 */
import { Client } from 'pg'
import { DataSource } from 'typeorm'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'

const CONN =
  process.env.PG_TEST_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD ?? 'postgres'}` +
    `@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5440'}/${process.env.POSTGRES_DB ?? 'postgres'}`

/** Lu avant que `describe` ne choisisse `it` vs `it.skip` — voir l'en-tête. */
const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RAG_DB_TEST)

const USER = 'f6f6f6f6-f6f6-4f6f-f6f6-f6f6f6f6f6f6'

describe('.insert() qui omet weekly_digest — contre un VRAI Postgres migré', () => {
  const test = DB_TEST_ENABLED ? it : it.skip
  let client: Client | null = null
  let dataSource: DataSource | null = null

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    client = new Client({ connectionString: CONN })
    await client.connect()
    await client.query(`DELETE FROM notification_preferences WHERE user_id = $1`, [USER])
    await client.query(`DELETE FROM auth.users WHERE id = $1`, [USER])
    await client.query(
      `INSERT INTO auth.users (id, email, instance_id, aud, role)
       VALUES ($1, 'weekly-digest-default-test@bellum.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
       ON CONFLICT (id) DO NOTHING`,
      [USER],
    )

    dataSource = new DataSource({
      type: 'postgres',
      url: CONN,
      entities: [NotificationPreferenceEntity],
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM notification_preferences WHERE user_id = $1`, [USER])
      await client.query(`DELETE FROM auth.users WHERE id = $1`, [USER])
      await client.end().catch(() => undefined)
    }
    await dataSource?.destroy().catch(() => undefined)
  })

  test('reproduit stampMarker : `weekly_digest`/`newsletter_changelog` sortent au DEFAULT SQL (`false`), jamais au défaut d’entité', async () => {
    const prefs = dataSource!.getRepository(NotificationPreferenceEntity)
    await prefs.insert({ user_id: USER, newsletter_last_entry_id: 'proof-entry' })

    const row = await prefs.findOneOrFail({ where: { user_id: USER } })
    expect(row.weekly_digest).toBe(false)
    expect(row.newsletter_changelog).toBe(false)
  })
})
