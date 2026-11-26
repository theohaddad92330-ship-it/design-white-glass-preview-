import { AccountsService } from './accounts.service'
import { AccountsController } from './accounts.controller'
import { AccountEntity } from '../../database/entities/account.entity'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2130.52 — DEUX UTILISATEURS SIMULTANÉS sur le MÊME compte, PAS de scénario
 * multi-session construit avant ce lot (constat des lots du 25/09 et du
 * 26/09 : « rien trouvé côté conflit temps réel »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────
 * `accounts.dossier-active-analysis.spec.ts` (#2128.19) prouve que le
 * CONTRÔLEUR relaie `active_analysis_by_colleague` — mais `AccountsService
 * .resolveActiveAnalysisByColleague`, la MÉTHODE RÉELLE qui compose le SQL
 * (exclusion de soi-même, cloisonnement par espace, dégradation silencieuse),
 * n'est mockée dans les CINQ specs qui la touchent (`accounts.controller
 * .spec.ts`, `.dossier-active-analysis.spec.ts`, `.dossier-business-unit
 * .spec.ts`, `.dossier-owner.spec.ts`, `business-unit-account-routes.spec
 * .ts`) — jamais exécutée pour de vrai. C'est exactement le défaut n°1 du
 * dépôt : du code juste, jamais appelé par un test qui l'exécute.
 */
describe('AccountsService.resolveActiveAnalysisByColleague — jamais exécutée avant ce lot', () => {
  let service: AccountsService
  let repo: MockRepository<AccountEntity>

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    const ia = {} as jest.Mocked<Pick<IaClient, 'discoverCompanies' | 'groupAffiliation' | 'searchCompanies'>>
    const workspaceContext = { resolveActiveWorkspace: jest.fn() }
    const esnProfile = { resolveProfileData: jest.fn() }
    service = new AccountsService(repo as never, ia as never, workspaceContext as never, esnProfile as never)
  })

  it('nomme le COLLÈGUE et l’instant, quand un AUTRE utilisateur a un run `analyzing` sur ce compte', async () => {
    repo.query.mockResolvedValue([
      {
        userId: 'user-2',
        startedAt: new Date('2026-09-28T08:00:00.000Z'),
        firstName: 'Sarah',
        lastName: 'Martin',
        email: null,
      },
    ])
    const result = await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    expect(result).toEqual({
      colleague: { user_id: 'user-2', name: 'Sarah Martin' },
      started_at: '2026-09-28T08:00:00.000Z',
    })
  })

  it('passe le compte, l’espace ET l’utilisateur courant au SQL — c’est CE paramètre qui exclut soi-même (jamais un filtre en mémoire)', async () => {
    repo.query.mockResolvedValue([])
    await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['acc-1', 'ws-1', 'user-1'])
    expect(sql).toContain('r.user_id <> $3')
    expect(sql).toContain('r.workspace_id = $2')
    expect(sql).toContain("r.status = 'analyzing'")
  })

  it('sans prénom ni nom, retombe sur l’e-mail — jamais un nom vide', async () => {
    repo.query.mockResolvedValue([
      {
        userId: 'user-2',
        startedAt: new Date('2026-09-28T08:00:00.000Z'),
        firstName: null,
        lastName: null,
        email: 'sarah@esn.fr',
      },
    ])
    const result = await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    expect(result?.colleague.name).toBe('sarah@esn.fr')
  })

  it('sans prénom, nom NI e-mail exploitable, rend `null` plutôt qu’un collègue sans nom', async () => {
    repo.query.mockResolvedValue([
      {
        userId: 'user-2',
        startedAt: new Date('2026-09-28T08:00:00.000Z'),
        firstName: null,
        lastName: null,
        email: null,
      },
    ])
    const result = await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    expect(result).toBeNull()
  })

  it('aucun run en cours rend `null` — jamais un objet inventé', async () => {
    repo.query.mockResolvedValue([])
    const result = await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    expect(result).toBeNull()
  })

  it('un échec SQL dégrade en `null` — le chevauchement est un CONFORT d’affichage, jamais une raison de casser le dossier', async () => {
    repo.query.mockRejectedValue(new Error('db down'))
    const result = await service.resolveActiveAnalysisByColleague('acc-1', 'ws-1', 'user-1')
    expect(result).toBeNull()
  })
})

/**
 * #2130.52 — LE SCÉNARIO ENTIER, à travers le VRAI contrôleur ET le VRAI
 * service (seule la frontière d'E/S — `repo.query` — est mockée) : deux
 * commerciaux du même espace ouvrent le même dossier, l'un pendant que
 * l'autre l'analyse déjà. Même patron que le lot N8 (#2130.42) : un test
 * d'intégration à défaut de serveur, aucun Playwright multi-session
 * exécutable dans cet environnement (pas de serveur web+api+DB monté).
 */
describe('GET /accounts/:id — deux utilisateurs simultanés, bout en bout (#2130.52)', () => {
  const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
  const USER_B: CurrentUserPayload = { userId: 'user-b', email: 'b@esn.fr' }

  function build(rows: unknown[]) {
    const repo = createMockRepository<AccountEntity>()
    repo.query.mockResolvedValue(rows)
    const ia = {} as jest.Mocked<Pick<IaClient, 'discoverCompanies' | 'groupAffiliation' | 'searchCompanies'>>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
    } as unknown as WorkspaceContextService
    const esnProfile = { resolveProfileData: jest.fn() }
    const accountsService = new AccountsService(repo as never, ia as never, workspaceContext, esnProfile as never)
    // `findOneForWorkspace` porte sa propre recherche compte (hors périmètre
    // de ce lot) : on le remplace SEUL, tout le reste (le collègue) traverse
    // le VRAI service.
    accountsService.findOneForWorkspace = jest.fn().mockResolvedValue({
      type: 'success',
      output: {
        id: ACCOUNT_ID,
        company_name: 'THALES',
        status: 'analyzing',
        assigned_to: null,
        updated_at: '2026-09-28T08:00:00.000Z',
      },
    }) as never
    accountsService.computeAgeDays = jest.fn(() => 0) as never
    accountsService.resolveLastAnalyzedAt = jest.fn().mockResolvedValue(null) as never
    accountsService.resolveOwner = jest.fn().mockResolvedValue(null) as never

    const controller = new AccountsController(
      accountsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workspaceContext,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    return controller
  }

  it('utilisateur A lance l’analyse ; utilisateur B ouvre le MÊME dossier et voit A nommé, pas lui-même', async () => {
    const controller = build([
      {
        userId: 'user-a',
        startedAt: new Date('2026-09-28T08:00:00.000Z'),
        firstName: 'Alice',
        lastName: 'Dupont',
        email: null,
      },
    ])
    const dossier = (await controller.findOne(ACCOUNT_ID, USER_B)) as { active_analysis_by_colleague: unknown }
    expect(dossier.active_analysis_by_colleague).toEqual({
      colleague: { user_id: 'user-a', name: 'Alice Dupont' },
      started_at: '2026-09-28T08:00:00.000Z',
    })
  })

  it('sait dire NON — seul un run d’un AUTRE utilisateur compte : le SQL exclut déjà le sien via `user_id <> $3`', async () => {
    // Le mock `repo.query` de ce test rend une ligne SEULEMENT si le SQL
    // exclut bien l'utilisateur courant — preuve que le contrôleur passe le
    // BON troisième paramètre au service réel, pas un id arbitraire.
    const repo = createMockRepository<AccountEntity>()
    repo.query.mockImplementation((_sql: string, params: unknown[]) =>
      Promise.resolve(
        params[2] === USER_B.userId
          ? []
          : [{ userId: 'ghost', startedAt: new Date(), firstName: 'X', lastName: null, email: null }],
      ),
    )
    const ia = {} as jest.Mocked<Pick<IaClient, 'discoverCompanies' | 'groupAffiliation' | 'searchCompanies'>>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
    } as unknown as WorkspaceContextService
    const accountsService = new AccountsService(repo as never, ia as never, workspaceContext, {} as never)
    accountsService.findOneForWorkspace = jest.fn().mockResolvedValue({
      type: 'success',
      output: { id: ACCOUNT_ID, company_name: 'THALES', status: 'completed', assigned_to: null, updated_at: '' },
    }) as never
    accountsService.computeAgeDays = jest.fn(() => 0) as never
    accountsService.resolveLastAnalyzedAt = jest.fn().mockResolvedValue(null) as never
    accountsService.resolveOwner = jest.fn().mockResolvedValue(null) as never

    const controller = new AccountsController(
      accountsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workspaceContext,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const dossier = (await controller.findOne(ACCOUNT_ID, USER_B)) as { active_analysis_by_colleague: unknown }
    expect(dossier.active_analysis_by_colleague).toBeNull()
  })
})
