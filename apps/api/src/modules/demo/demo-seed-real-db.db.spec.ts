/**
 * #4035.1 (W13) — la salle démo se sème sur une VRAIE base, deux fois.
 *
 * L'incident du 11/10 : `demo-seed.service.ts` écrivait `opportunities.stage = 'abandoned'`, refusé par
 * `opportunities_stage_check`. Chaque re-semis de salle échouait, ~8 h de « Préparation de ta démo… » sans fin pour
 * tout prospect. Les specs du semis MOCKENT la base : aucune contrainte SQL n'y est appliquée, la CI était verte.
 * Même famille le 28/09 (`duplicate key` au re-semis, salle servie « AS IS »). Louis : « ça doit pas arriver, faut
 * toujours que la démo soit up sinon ça déploie pas ».
 *
 * Ce test prend le VRAI chemin de production — `DemoResetService.seedNewRoom` (salle neuve) puis `resetWorkspace`
 * (purge + semis, le re-semis du pool) — sur un Postgres où TOUTES les migrations sont passées
 * (`scripts/migrate-fresh-ci.ts`). La moindre requête refusée par une contrainte fait échouer le test, avec la
 * requête et la contrainte dans le message.
 *
 * OPT-IN (`PG_TEST_URL`), comme les autres preuves adossées à une base. Le job CI « Démo (semis sur vraie base) » le
 * pose ET pose `DEMO_DB_REQUIRED=1` : alors un interrupteur absent fait ÉCHOUER le test au lieu de le sauter — une
 * garde qui se saute en silence est celle qui a laissé passer l'incident.
 */
import { Test } from '@nestjs/testing'
import { AppModule } from '../../app.module'
import { StorageClient } from '../storage/storage.client'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import { DemoResetService } from './demo-reset.service'
import { DataSource } from 'typeorm'

const DB_TEST_ENABLED = Boolean(process.env['PG_TEST_URL'])
const REQUIRED = process.env['DEMO_DB_REQUIRED'] === '1'
const maybe = DB_TEST_ENABLED || REQUIRED ? it : it.skip

const WORKSPACE = '5e5e5e5e-0000-4000-8000-000000000001'
const OWNER = '5e5e5e5e-0000-4000-8000-000000000002'
// #4291 J — la salle FORFAIT / CONSEIL (numéro > 1000) : mêmes CHECK, mêmes FK, sur la même base.
const FORFAIT_WORKSPACE = '5e5e5e5e-0000-4000-8000-000000000003'
const FORFAIT_OWNER = '5e5e5e5e-0000-4000-8000-000000000004'

describe('démo — le semis sur une vraie base (#4035.1)', () => {
  jest.setTimeout(240_000)

  let reset: DemoResetService | undefined
  let ds: DataSource | undefined

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Les octets des fichiers de la salle partent vers le stockage objet : sans lui, le dépôt échoue et la ligne
      // n'est pas écrite (contrat de `seedStoredFile`) — ce que ce test ne juge pas.
      .overrideProvider(StorageClient)
      .useValue({ upload: async () => null, put: async () => undefined })
      // R35 — sans GoTrue local, les collègues fictifs (clé étrangère dure vers `auth.users`) ne se montent pas et
      // leurs tables restent vides : la salle se lirait « incomplète » pour une raison d'environnement. Le gateway
      // écrit donc directement dans `auth.users` (le bootstrap CI), ce que GoTrue ferait.
      .overrideProvider(SupabaseAuthGateway)
      .useFactory({
        factory: () => ({
          findUserById: async (id: string) => {
            const rows: Array<{ id: string }> = await ds!.query('SELECT id FROM auth.users WHERE id = $1', [id])
            return rows[0] ? { id } : undefined
          },
          client: {
            auth: {
              admin: {
                createUser: async (u: { id: string; email: string }) => {
                  await ds!.query('INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
                    u.id,
                    u.email,
                  ])
                  return { error: null }
                },
              },
            },
          },
        }),
      })
      .compile()
    reset = moduleRef.get(DemoResetService, { strict: false })
    const dataSource = moduleRef.get(DataSource, { strict: false })
    ds = dataSource
    await dataSource.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'demo-garde@example.invalid') ON CONFLICT DO NOTHING`,
      [OWNER],
    )
    await dataSource.query(
      `INSERT INTO workspaces (id, name, is_demo, owner_user_id) VALUES ($1, 'Salle garde CI', true, $2) ON CONFLICT DO NOTHING`,
      [WORKSPACE, OWNER],
    )
    await dataSource.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'demo-garde-forfait@example.invalid') ON CONFLICT DO NOTHING`,
      [FORFAIT_OWNER],
    )
    await dataSource.query(
      `INSERT INTO workspaces (id, name, is_demo, owner_user_id, demo_slot_index)
       VALUES ($1, 'Salle garde CI forfait', true, $2, 1001) ON CONFLICT DO NOTHING`,
      [FORFAIT_WORKSPACE, FORFAIT_OWNER],
    )
  })

  afterAll(async () => {
    await ds?.destroy().catch(() => undefined)
  })

  maybe('exige l’interrupteur quand le job CI le réclame', () => {
    if (REQUIRED && !DB_TEST_ENABLED)
      throw new Error('DEMO_DB_REQUIRED=1 mais PG_TEST_URL absent — la garde ne tourne pas')
  })

  maybe(
    'sème une salle neuve puis la re-sème (purge + semis) sans qu’aucune contrainte SQL ne refuse une ligne',
    async () => {
      if (!reset) throw new Error('module non monté')
      const first = await reset.seedNewRoom(WORKSPACE, OWNER)
      expect(first.seeded).toBe(true)
      const second = await reset.resetWorkspace(WORKSPACE, OWNER)
      expect(second.seeded).toBe(true)
      expect(second.purged).toBeGreaterThan(0)
    },
  )
  // R35 (16/10/2026) — « semis terminé ⇒ lecture immédiate ⇒ PAS périmée, PAS incomplète ». Sans cette
  // propriété, chaque renouvellement de bail (`repairIfIncomplete`) re-purge une salle que le semis vient de finir.
  maybe(
    'une salle tout juste semée se relit « prête » : ni périmée, ni incomplète — la réparation ne fait rien',
    async () => {
      if (!reset) throw new Error('module non monté')
      await reset.resetWorkspace(WORKSPACE, OWNER)
      const state = await (
        reset as unknown as { readRoom(w: string, o: string): Promise<Record<string, unknown>> }
      ).readRoom(WORKSPACE, OWNER)
      expect({ stale: state['fingerprintStale'], missing: state['missing'] }).toEqual({ stale: false, missing: [] })
      expect(await reset.isRoomReady(WORKSPACE, OWNER)).toBe(true)
      const repair = await reset.repairIfIncomplete(WORKSPACE, OWNER)
      expect(repair.skipped).toBe(true)
    },
  )

  // #4291 J — la salle forfait se sème et se re-sème sans qu'aucune contrainte ne refuse une ligne, se relit
  // « prête » dans SA variante, et sa remise à neuf ne touche jamais la salle staffing.
  maybe('sème puis re-sème une salle forfait / conseil, sans toucher à la salle staffing', async () => {
    if (!reset || !ds) throw new Error('module non monté')
    await reset.resetWorkspace(WORKSPACE, OWNER)
    const count = async (workspaceId: string): Promise<number> => {
      const rows: Array<{ n: string }> = await ds!.query(
        'SELECT COUNT(*)::text AS n FROM accounts WHERE workspace_id = $1',
        [workspaceId],
      )
      return Number(rows[0]?.n ?? 0)
    }
    const staffingBefore = await count(WORKSPACE)

    const first = await reset.seedNewRoom(FORFAIT_WORKSPACE, FORFAIT_OWNER)
    expect(first.seeded).toBe(true)
    const second = await reset.resetWorkspace(FORFAIT_WORKSPACE, FORFAIT_OWNER)
    expect(second.seeded).toBe(true)
    expect(await reset.isRoomReady(FORFAIT_WORKSPACE, FORFAIT_OWNER)).toBe(true)

    const [profile]: Array<{ workspace_profile: string | null }> = await ds.query(
      'SELECT workspace_profile FROM esn_profiles WHERE workspace_id = $1 AND version = 1',
      [FORFAIT_WORKSPACE],
    )
    expect(profile?.workspace_profile).toBe('forfait_conseil')
    const won: Array<{ n: string }> = await ds.query(
      `SELECT COUNT(*)::text AS n FROM missions m JOIN project_needs n ON n.id = m.need_id
          WHERE m.workspace_id = $1 AND m.delivery_mode = 'supervised' AND n.status = 'won'`,
      [FORFAIT_WORKSPACE],
    )
    expect(Number(won[0]?.n ?? 0)).toBeGreaterThanOrEqual(2)
    expect(await count(FORFAIT_WORKSPACE)).toBeGreaterThan(staffingBefore)
    // La salle staffing : intacte, et toujours prête dans SA variante.
    expect(await count(WORKSPACE)).toBe(staffingBefore)
    expect(await reset.isRoomReady(WORKSPACE, OWNER)).toBe(true)
  })
  // Recette démo 31/10 (#4195.5 #4193.6 #4290.12 #4295.11) — six écrans mesurés VIDES en prod alors que le semis les
  // déclarait remplis : les specs qui mockent la base ne le voient pas, celle-ci relit la base réellement semée.
  maybe('les écrans vides de la recette 31/10 sont remplis sur une vraie salle', async () => {
    if (!reset || !ds) throw new Error('module non monté')
    await reset.resetWorkspace(WORKSPACE, OWNER)

    // #4195.5 — l'affaire SNCF « Renfort régie » est en Négociation avec ses deux positionnements retenus.
    const deals: Array<{ id: string; stage: string }> = await ds.query(
      `SELECT o.id, o.stage FROM opportunities o JOIN accounts a ON a.id = o.account_id
        WHERE o.workspace_id = $1 AND a.company_name = 'SNCF' AND o.label LIKE 'Renfort régie%'`,
      [WORKSPACE],
    )
    expect(deals.map(deal => deal.stage)).toEqual(['negotiation'])
    const retained: Array<{ n: string }> = await ds.query(
      `SELECT COUNT(*)::text AS n FROM submissions WHERE workspace_id = $1 AND project_id = $2 AND stage = 'accepted'`,
      [WORKSPACE, deals[0]?.id],
    )
    expect(Number(retained[0]?.n ?? 0)).toBe(2)

    // #4193.6 — au moins une mission en cours finit dans CHAQUE fenêtre 30 / 60 / 90 jours, sur SNCF et sur Orange.
    for (const company of ['SNCF', 'Orange']) {
      const windows: Array<{ w30: string; w60: string; w90: string }> = await ds.query(
        `SELECT COUNT(*) FILTER (WHERE m.ends_on <= current_date + 30)::text AS w30,
                COUNT(*) FILTER (WHERE m.ends_on > current_date + 30 AND m.ends_on <= current_date + 60)::text AS w60,
                COUNT(*) FILTER (WHERE m.ends_on > current_date + 60 AND m.ends_on <= current_date + 90)::text AS w90
           FROM missions m JOIN accounts a ON a.id = m.account_id
          WHERE m.workspace_id = $1 AND a.company_name = $2 AND m.status = 'active' AND m.ends_on > current_date`,
        [WORKSPACE, company],
      )
      expect({ company, ...windows[0] }).toEqual({
        company,
        w30: expect.not.stringMatching(/^0$/),
        w60: expect.not.stringMatching(/^0$/),
        w90: expect.not.stringMatching(/^0$/),
      })
    }

    // #4290.12 — un contact « a quitté l'entreprise » sur SNCF.
    const left: Array<{ n: string }> = await ds.query(
      `SELECT COUNT(*)::text AS n FROM contacts c JOIN accounts a ON a.id = c.account_id
        WHERE c.workspace_id = $1 AND a.company_name = 'SNCF' AND c.raw_data -> 'employmentCheck' ->> 'state' = 'left'`,
      [WORKSPACE],
    )
    expect(Number(left[0]?.n ?? 0)).toBeGreaterThanOrEqual(1)

    // #4295.11 — un contact SNCF est sur la liste « ne pas contacter » (le filtre « Ne pas solliciter » le montre).
    const listed: Array<{ n: string }> = await ds.query(
      `SELECT COUNT(*)::text AS n FROM workspace_do_not_contact d JOIN contacts c ON c.id = d.contact_id
         JOIN accounts a ON a.id = c.account_id
        WHERE d.workspace_id = $1 AND d.lifted_at IS NULL AND a.company_name = 'SNCF'`,
      [WORKSPACE],
    )
    expect(Number(listed[0]?.n ?? 0)).toBeGreaterThanOrEqual(1)
  })
})
