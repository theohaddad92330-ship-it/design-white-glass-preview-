import {
  DEMO_COLLEAGUE_ACTIVITY,
  DEMO_COLLEAGUES,
  DEMO_DELEGATED_ACTIONS,
  DEMO_SHARED_ACCOUNT_WORK,
  DEMO_DOSSIERS,
  DEMO_USER_ACTIONS,
} from './demo-dataset'
import { DemoSeedService } from './demo-seed.service'

/**
 * #4158.13 — l'espace de démonstration reçoit TROIS collègues fictifs, pour que
 * la barre latérale affiche « Équipe » et que `/team` montre une équipe vivante.
 * Deux choses à tenir : le jeu (cohérent, sans collision avec l'occupant) et le
 * semis (qui ne doit JAMAIS casser la salle).
 */
describe('#4158.13 — le jeu de collègues fictifs', () => {
  const dossierNames = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))

  it('compte trois collègues : prénom + nom complets, rôles sales / sales / admin', () => {
    expect(DEMO_COLLEAGUES).toHaveLength(3)
    expect(DEMO_COLLEAGUES.map(c => c.role)).toEqual(['sales', 'sales', 'admin'])
    for (const colleague of DEMO_COLLEAGUES) {
      expect(colleague.first_name.trim().length).toBeGreaterThan(1)
      expect(colleague.last_name.trim().length).toBeGreaterThan(1)
    }
  })

  it('identifiants et adresses uniques ; adresses sur un domaine RÉSERVÉ (rien n’y arrive)', () => {
    expect(new Set(DEMO_COLLEAGUES.map(c => c.userId)).size).toBe(3)
    expect(new Set(DEMO_COLLEAGUES.map(c => c.email)).size).toBe(3)
    for (const colleague of DEMO_COLLEAGUES) {
      expect(colleague.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(colleague.email).toMatch(/@exemple\.test$/)
    }
  })

  it('chaque compte porté par un collègue existe dans la salle, et un compte n’a qu’un porteur', () => {
    const carried = DEMO_COLLEAGUES.flatMap(c => c.accounts)
    for (const company of carried) expect(dossierNames).toContain(company)
    expect(new Set(carried).size).toBe(carried.length)
  })

  it('les dossiers vedettes restent à l’occupant — le parcours de démonstration en dépend', () => {
    const carried = new Set(DEMO_COLLEAGUES.flatMap(c => c.accounts))
    for (const company of ['Société Générale', 'Groupe BPCE', 'SNCF', 'ENGIE', 'BNP Paribas', 'TotalEnergies']) {
      expect(carried.has(company)).toBe(false)
    }
  })

  it('actions déléguées et activité ne nomment que des collègues réels, sur LEURS comptes', () => {
    const accountsOf = new Map(DEMO_COLLEAGUES.map(c => [c.key, new Set(c.accounts)]))
    expect(DEMO_DELEGATED_ACTIONS.length).toBeGreaterThanOrEqual(2)
    for (const action of DEMO_DELEGATED_ACTIONS) {
      expect(accountsOf.get(action.colleague)?.has(action.company)).toBe(true)
      expect(action.dueInDays).toBeGreaterThan(0)
    }
    expect(DEMO_COLLEAGUE_ACTIVITY.length).toBeGreaterThanOrEqual(3)
    for (const entry of DEMO_COLLEAGUE_ACTIVITY) {
      expect(accountsOf.get(entry.colleague)?.has(entry.company)).toBe(true)
    }
  })

  it('aucune activité de collègue sur un compte où l’occupant a agi — rien ne ressemble à une collision', () => {
    const ownerCompanies = new Set(DEMO_USER_ACTIONS.flatMap(action => (action.company ? [action.company] : [])))
    for (const entry of DEMO_COLLEAGUE_ACTIVITY) expect(ownerCompanies.has(entry.company)).toBe(false)
  })

  it('aucune activité ne porte de preuve d’envoi', () => {
    for (const entry of DEMO_COLLEAGUE_ACTIVITY) {
      expect(entry.action_type).not.toMatch(/sent|email_sent|message_sent/)
    }
  })
})

describe('#4158.13 — le semis des collègues ne casse jamais la salle', () => {
  const OWNER = 'owner-1'
  const WS = 'ws-1'
  const accountIds = new Map(DEMO_DOSSIERS.map((dossier, i) => [dossier.account.company_name, `acc-${i}`]))
  const now = Date.UTC(2026, 9, 14)

  function build(
    opts: { gateway?: unknown; existingMembers?: string[]; existingProfiles?: string[]; failSql?: boolean } = {},
  ) {
    const saved: { members: unknown[]; profiles: unknown[]; actions: unknown[] } = {
      members: [],
      profiles: [],
      actions: [],
    }
    const queries: { sql: string; params: unknown[] }[] = []
    const members = {
      findOne: jest.fn(async ({ where }: { where: { user_id: string } }) =>
        opts.existingMembers?.includes(where.user_id) ? { id: 'm' } : null,
      ),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: unknown) => {
        saved.members.push(row)
        return row
      }),
    }
    const profiles = {
      findOne: jest.fn(async ({ where }: { where: { user_id: string } }) =>
        opts.existingProfiles?.includes(where.user_id) ? { user_id: where.user_id } : null,
      ),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: unknown) => {
        saved.profiles.push(row)
        return row
      }),
      update: jest.fn(async () => undefined),
    }
    const accounts = {
      manager: {
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (opts.failSql) throw new Error('connection reset')
          queries.push({ sql, params })
          return []
        }),
      },
    }
    const userActions = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (rows: unknown[]) => {
        saved.actions.push(...rows)
        return rows
      }),
    }
    const service = Object.create(DemoSeedService.prototype) as DemoSeedService
    Object.assign(service, {
      members,
      profiles,
      accounts,
      userActions,
      authGateway: opts.gateway,
      logger: { warn: jest.fn(), log: jest.fn() },
    })
    const run = () =>
      (
        service as unknown as {
          seedColleagues: (w: string, o: string, a: Map<string, string>, n: number) => Promise<void>
        }
      ).seedColleagues(WS, OWNER, accountIds, now)
    return { run, saved, queries, members, profiles, userActions }
  }

  function gateway(opts: { existing?: string[]; failFor?: string } = {}) {
    const createUser = jest.fn(async ({ id }: { id: string }) => ({
      error: opts.failFor === id ? { message: 'email already registered' } : null,
    }))
    return {
      createUser,
      value: {
        findUserById: jest.fn(async (id: string) => (opts.existing?.includes(id) ? { id } : undefined)),
        client: { auth: { admin: { createUser } } },
      },
    }
  }

  it('sans passerelle d’authentification : la salle reste à un seul occupant, sans rien écrire ni lever', async () => {
    const t = build()
    await expect(t.run()).resolves.toBeUndefined()
    expect(t.members.save).not.toHaveBeenCalled()
    expect(t.queries).toHaveLength(0)
  })

  it('crée les trois comptes SANS mot de passe, puis profil et appartenance avec le bon rôle', async () => {
    const g = gateway()
    const t = build({ gateway: g.value })
    await t.run()
    expect(g.createUser).toHaveBeenCalledTimes(3)
    for (const [arg] of g.createUser.mock.calls) {
      expect(arg).not.toHaveProperty('password')
      expect(arg).toMatchObject({ email_confirm: true })
    }
    expect(t.saved.members).toEqual(
      DEMO_COLLEAGUES.map(c => expect.objectContaining({ workspace_id: WS, user_id: c.userId, role: c.role })),
    )
    expect(t.saved.profiles).toHaveLength(3)
  })

  it('reprend les comptes secondaires aux collègues (compte ET contacts), jamais les dossiers vedettes', async () => {
    const t = build({ gateway: gateway().value })
    await t.run()
    const reassigned = t.queries.filter(q => /UPDATE (accounts|contacts) SET assigned_to/.test(q.sql))
    // 6 comptes portés × (compte + contacts).
    expect(reassigned).toHaveLength(DEMO_COLLEAGUES.flatMap(c => c.accounts).length * 2)
    for (const q of reassigned) expect(q.params[1]).toBe(WS)
    const touched = new Set(reassigned.map(q => q.params[0]))
    expect(touched.has(accountIds.get('Société Générale'))).toBe(false)
  })

  it('délègue des actions (créées par l’occupant, portées par le collègue) et sème leur activité', async () => {
    const t = build({ gateway: gateway().value })
    await t.run()
    const inserts = t.queries.filter(q => q.sql.includes('INSERT INTO action_plan_items'))
    // + les tâches de compte analysé par l'occupant (29/10/2026, DEMO_SHARED_ACCOUNT_WORK).
    expect(inserts).toHaveLength(DEMO_DELEGATED_ACTIONS.length + DEMO_SHARED_ACCOUNT_WORK.length)
    for (const q of inserts) {
      expect(q.params[0]).toBe(OWNER)
      expect(DEMO_COLLEAGUES.map(c => c.userId)).toContain(q.params[5])
    }
    expect(t.saved.actions).toHaveLength(DEMO_COLLEAGUE_ACTIVITY.length)
    for (const action of t.saved.actions as { user_id: string; workspace_id: string }[]) {
      expect(DEMO_COLLEAGUES.map(c => c.userId)).toContain(action.user_id)
      expect(action.workspace_id).toBe(WS)
    }
  })

  it('un compte qui ne se crée pas laisse CE collègue de côté — jamais à moitié monté — et ne casse rien', async () => {
    const failing = DEMO_COLLEAGUES[1]!.userId
    const t = build({ gateway: gateway({ failFor: failing }).value })
    await expect(t.run()).resolves.toBeUndefined()
    const memberIds = (t.saved.members as { user_id: string }[]).map(m => m.user_id)
    expect(memberIds).not.toContain(failing)
    expect(memberIds).toHaveLength(2)
    // Ses actions ne sont pas déléguées à un membre qui n'existe pas.
    const delegatedTo = t.queries.filter(q => q.sql.includes('INSERT INTO action_plan_items')).map(q => q.params[5])
    expect(delegatedTo).not.toContain(failing)
  })

  it('est idempotent : un collègue déjà membre (workspace_members survit au reset) n’est pas réécrit', async () => {
    const g = gateway({ existing: DEMO_COLLEAGUES.map(c => c.userId) })
    const t = build({
      gateway: g.value,
      existingMembers: DEMO_COLLEAGUES.map(c => c.userId),
      existingProfiles: DEMO_COLLEAGUES.map(c => c.userId),
    })
    await t.run()
    expect(g.createUser).not.toHaveBeenCalled()
    expect(t.members.save).not.toHaveBeenCalled()
    expect(t.profiles.save).not.toHaveBeenCalled()
  })

  it('une panne SQL en cours de route est avalée : la salle reste servie, les membres déjà écrits restent', async () => {
    const t = build({ gateway: gateway().value, failSql: true })
    await expect(t.run()).resolves.toBeUndefined()
    expect(t.saved.members).toHaveLength(3)
  })
})
