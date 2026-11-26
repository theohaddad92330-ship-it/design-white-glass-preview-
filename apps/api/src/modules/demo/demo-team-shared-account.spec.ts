import { DEMO_COLLEAGUES, DEMO_DOSSIERS, DEMO_SHARED_ACCOUNT_WORK } from './demo-dataset'
import { DEMO_TEAM_COLLEAGUES_COVERAGE } from './demo-coverage'
import { DemoSeedService } from './demo-seed.service'

/**
 * 29/10/2026 (Louis) — RENVERSEMENT de #2117.14 (« l'espace de démo est solo ») : « le mode équipe
 * est ce que Bedros et Adel ont acheté : un prospect doit le voir ». Cette garde TIENT la décision :
 * si la salle redevient solo, ou si le geste « un coéquipier travaille le compte qu'un autre a
 * analysé » (le P0 de #4731) cesse d'être mis en scène, elle échoue.
 */
describe('29/10/2026 — la salle de démonstration n’est pas solo : un compte analysé par l’un, travaillé par l’autre', () => {
  const owned = (company: string) => DEMO_COLLEAGUES.some(c => c.accounts.includes(company))

  it('l’espace compte au moins un second membre, FICTIF, sur un domaine réservé', () => {
    expect(DEMO_COLLEAGUES.length).toBeGreaterThanOrEqual(1)
    for (const colleague of DEMO_COLLEAGUES) {
      expect(colleague.email).toMatch(/@(exemple\.test|example\.(org|com|net))$/)
    }
  })

  it('met en scène au moins un compte analysé par l’occupant et travaillé par un autre membre', () => {
    expect(DEMO_SHARED_ACCOUNT_WORK.length).toBeGreaterThanOrEqual(1)
    const dossierOf = new Map(DEMO_DOSSIERS.map(d => [d.account.company_name, d]))
    for (const work of DEMO_SHARED_ACCOUNT_WORK) {
      const dossier = dossierOf.get(work.company)
      expect(dossier).toBeDefined()
      expect(dossier?.account.analysis_status ?? 'completed').toBe('completed')
      // Analysé par le PREMIER membre : le compte reste porté par l'occupant…
      expect(owned(work.company)).toBe(false)
      // …et travaillé par le SECOND : un collègue réel de la salle.
      expect(DEMO_COLLEAGUES.map(c => c.key)).toContain(work.colleague)
      expect(work.dueInDays).toBeGreaterThan(0)
    }
  })

  it('aucune preuve d’envoi, le geste est une tâche, jamais une action de prospection', () => {
    for (const work of DEMO_SHARED_ACCOUNT_WORK) {
      expect(work.label).not.toMatch(/envoy|e-?mail|relanc/i)
    }
  })

  it('est classée SEEDÉE dans demo-coverage, avec le geste qu’elle prouve', () => {
    const entry = DEMO_TEAM_COLLEAGUES_COVERAGE.compteAnalyseTravaille
    expect(entry?.state).toBe('seede')
    expect(entry?.reason).toMatch(/#4731/)
  })

  it('le semis écrit la tâche : créée par l’occupant, portée par le collègue, sur le compte de l’occupant', async () => {
    const queries: { sql: string; params: unknown[] }[] = []
    const accountIds = new Map(DEMO_DOSSIERS.map((d, i) => [d.account.company_name, `acc-${i}`]))
    const service = Object.create(DemoSeedService.prototype) as DemoSeedService
    Object.assign(service, {
      members: {
        findOne: jest.fn(async () => null),
        create: jest.fn((r: unknown) => r),
        save: jest.fn(async (r: unknown) => r),
      },
      profiles: {
        findOne: jest.fn(async () => null),
        create: jest.fn((r: unknown) => r),
        save: jest.fn(async (r: unknown) => r),
        update: jest.fn(async () => undefined),
      },
      accounts: {
        manager: {
          query: jest.fn(async (sql: string, params: unknown[]) => {
            queries.push({ sql, params })
            return []
          }),
        },
      },
      userActions: { create: jest.fn((r: unknown) => r), save: jest.fn(async (r: unknown) => r) },
      authGateway: {
        findUserById: jest.fn(async () => undefined),
        client: { auth: { admin: { createUser: jest.fn(async () => ({ error: null })) } } },
      },
      logger: { warn: jest.fn(), log: jest.fn() },
    })
    await (
      service as unknown as {
        seedColleagues: (w: string, o: string, a: Map<string, string>, n: number) => Promise<void>
      }
    ).seedColleagues('ws-1', 'owner-1', accountIds, Date.UTC(2026, 9, 29))
    for (const work of DEMO_SHARED_ACCOUNT_WORK) {
      const colleague = DEMO_COLLEAGUES.find(c => c.key === work.colleague)
      const row = queries.find(
        q => q.sql.includes('INSERT INTO action_plan_items') && q.params[1] === accountIds.get(work.company),
      )
      expect(row).toBeDefined()
      expect(row?.params[0]).toBe('owner-1')
      expect(row?.params[5]).toBe(colleague?.userId)
    }
  })
})
