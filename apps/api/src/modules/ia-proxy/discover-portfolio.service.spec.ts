import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DiscoverPortfolioService } from './discover-portfolio.service'

/**
 * `portfolioState` is what stops Découvrir from proposing accounts the rep
 * already owns — the single most visible way the screen wastes a seller's time.
 * The rules under test:
 *
 *  - matching is workspace-scoped (a teammate's account counts, another
 *    tenant's never does);
 *  - an existing account is NEVER reported as `new`, whatever its analysis
 *    status — owning it is the point;
 *  - a soft-deleted account frees the candidate again;
 *  - SIREN is the pivot, with the legacy name match as a fallback for rows
 *    created before `accounts.siren` was populated.
 */
const WORKSPACE = 'ws-1'

type Row = Partial<AccountEntity>

const build = async (
  rows: Row[],
  // #3819.1 — lignes brutes `{ accountId, count }` que le COMPTE de besoins
  // ouverts rendrait côté base ; `null` simule une panne de la requête.
  needRows: Array<{ accountId: string; count: string }> | null = [],
  // #3819.1 — lignes brutes `{ accountId, count }` du décompte des besoins lus
  // dans l'ANALYSE (douleurs, chantiers IT, programmes) ; `null` = panne.
  analysisNeedRows: Array<{ accountId: string; count: string }> | null = [],
) => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  }
  const manager = {
    query:
      analysisNeedRows === null
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn().mockResolvedValue(analysisNeedRows),
  }
  const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), manager }
  const needQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany:
      needRows === null ? jest.fn().mockRejectedValue(new Error('db down')) : jest.fn().mockResolvedValue(needRows),
  }
  const needsRepo = { createQueryBuilder: jest.fn().mockReturnValue(needQb) }
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscoverPortfolioService,
      { provide: getRepositoryToken(AccountEntity), useValue: repo },
      { provide: getRepositoryToken(ProjectNeedEntity), useValue: needsRepo },
      { provide: WorkspaceContextService, useValue: workspace },
    ],
  }).compile()
  return { service: moduleRef.get(DiscoverPortfolioService), manager, qb, repo, needQb, needsRepo, workspace }
}

const candidate = (siren: string, name = 'ACME') => ({ siren, name })

// #4294.7 — « Déjà travaillées » se calcule à la LECTURE : jamais écrit sur le compte, jamais deviné.
describe('DiscoverPortfolioService — workedBefore (#4294.7)', () => {
  const rows: Row[] = [
    { id: 'acc-c', siren: '111111111', company_name: 'CLIENT', status: 'completed', commercial_status: 'customer' },
    { id: 'acc-m', siren: '222222222', company_name: 'AVEC MISSION', status: 'completed', commercial_status: 'inbox' },
    { id: 'acc-i', siren: '333333333', company_name: 'JUSTE ANALYSE', status: 'completed', commercial_status: 'inbox' },
  ]

  it('un client ET un compte portant une mission passée sont « déjà travaillés » ; une simple analyse non', async () => {
    const { service, manager } = await build(rows, [], [{ id: 'acc-c' }, { id: 'acc-m' }] as never)
    const results = await service.resolve('user-1', [
      candidate('111111111'),
      candidate('222222222'),
      candidate('333333333'),
      candidate('999999999'),
    ])
    expect(results.map(result => 'workedBefore' in result && result.workedBefore)).toEqual([true, true, false, false])
    // une seule requête pour toute la page, bornée à l'espace
    const worked = manager.query.mock.calls.find(call => String(call[0]).includes('FROM missions'))
    expect(worked?.[1]).toEqual([WORKSPACE, ['acc-c', 'acc-m', 'acc-i']])
  })

  it('panne de la lecture : l’état portefeuille reste, aucun « déjà travaillé » n’est inventé', async () => {
    const { service } = await build(rows, [], null)
    const [result] = await service.resolve('user-1', [candidate('111111111')])
    expect(result).toMatchObject({ portfolioState: 'customer', accountId: 'acc-c' })
    expect('workedBefore' in (result ?? {})).toBe(false)
  })
})

describe('DiscoverPortfolioService', () => {
  it('marks an unknown company as new with no accountId', async () => {
    const { service } = await build([])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'new', accountId: null })
  })

  it('maps a customer account to customer', async () => {
    const { service } = await build([
      { id: 'acc-1', siren: '552081317', company_name: 'ACME', status: 'completed', commercial_status: 'customer' },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'customer', accountId: 'acc-1' })
  })

  it.each(['watching', 'opportunity'])('maps a %s account to watched', async commercial_status => {
    const { service } = await build([
      { id: 'acc-2', siren: '552081317', company_name: 'ACME', status: 'completed', commercial_status },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result.portfolioState).toBe('watched')
  })

  it('maps an inbox account to analyzed', async () => {
    const { service } = await build([
      { id: 'acc-3', siren: '552081317', company_name: 'ACME', status: 'completed', commercial_status: 'inbox' },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'analyzed', accountId: 'acc-3' })
  })

  it('never reports an owned account as new, even mid-analysis or errored', async () => {
    // Re-proposing an account the rep already launched is the exact waste this
    // field exists to prevent — `status` must not open that door back up.
    for (const status of ['analyzing', 'error', 'canceled', 'archived']) {
      const { service } = await build([
        { id: 'acc-4', siren: '552081317', company_name: 'ACME', status, commercial_status: 'inbox' },
      ])
      const [result] = await service.resolve('user-1', [candidate('552081317')])
      expect(result.portfolioState).not.toBe('new')
      expect(result.accountId).toBe('acc-4')
    }
  })

  it('frees a candidate again once its account is soft-deleted', async () => {
    const { service } = await build([
      { id: 'acc-5', siren: '552081317', company_name: 'ACME', status: 'deleted', commercial_status: 'customer' },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'new', accountId: null })
  })

  it('falls back to the company name for legacy rows with no siren', async () => {
    const { service } = await build([
      { id: 'acc-6', siren: null, company_name: '  Acme  ', status: 'completed', commercial_status: 'watching' },
    ])
    const [result] = await service.resolve('user-1', [{ siren: '552081317', name: 'ACME' }])
    expect(result).toEqual({ portfolioState: 'watched', accountId: 'acc-6' })
  })

  it('prefers the SIREN match over a name collision', async () => {
    // Two different companies can share a trade name; the registry id wins.
    const { service } = await build([
      { id: 'by-name', siren: '999888777', company_name: 'ACME', status: 'completed', commercial_status: 'inbox' },
      {
        id: 'by-siren',
        siren: '552081317',
        company_name: 'ACME SA',
        status: 'completed',
        commercial_status: 'customer',
      },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317', 'ACME')])
    expect(result).toEqual({ portfolioState: 'customer', accountId: 'by-siren' })
  })

  it('scopes the lookup to the caller active workspace', async () => {
    const { service, qb, workspace } = await build([])
    await service.resolve('user-1', [candidate('552081317')])
    expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: WORKSPACE })
  })

  it('resolves a whole page in ONE query, not one per candidate', async () => {
    const { service, repo } = await build([])
    const candidates = Array.from({ length: 30 }, (_, i) => candidate(String(100000000 + i)))
    const results = await service.resolve('user-1', candidates)
    expect(results).toHaveLength(30)
    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1)
  })

  it('skips the query entirely for an empty candidate list', async () => {
    // TypeORM throws on an empty `IN (:...ids)` parameter — and a round-trip for
    // zero candidates is waste either way.
    const { service, repo } = await build([])
    expect(await service.resolve('user-1', [])).toEqual([])
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })

  // #2166.1 — le logo n'est jamais deviné : il ne voyage que quand le candidat
  // correspond déjà à un compte possédé du même espace (même règle que
  // `AccountPartner.logo_url`, #1818.2).
  it('porte le logo et le site du compte possédé (#2166.1)', async () => {
    const { service } = await build([
      {
        id: 'acc-7',
        siren: '552081317',
        company_name: 'ACME',
        status: 'completed',
        commercial_status: 'customer',
        logo_url: 'https://logo.example/acme.png',
        website: 'acme.com',
      } as Row,
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({
      portfolioState: 'customer',
      accountId: 'acc-7',
      logoUrl: 'https://logo.example/acme.png',
      website: 'acme.com',
    })
  })

  it('ne porte ni logo ni site pour un candidat pas encore possédé — jamais deviné', async () => {
    const { service } = await build([])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'new', accountId: null })
  })

  // #2165.24 / #2166.3 / #2165.16 — même règle que le logo ci-dessus.
  it('porte le rattachement capitalistique du compte possédé', async () => {
    const { service } = await build([
      {
        id: 'acc-8',
        siren: '326300159',
        company_name: 'TF1',
        status: 'completed',
        commercial_status: 'customer',
        group_role: 'filiale',
        group_head_siren: '222222222',
      } as Row,
    ])
    const [result] = await service.resolve('user-1', [candidate('326300159')])
    expect(result).toEqual(
      expect.objectContaining({
        portfolioState: 'customer',
        accountId: 'acc-8',
        groupRole: 'filiale',
        groupHeadSiren: '222222222',
      }),
    )
  })

  it('ne porte pas de rattachement pour un candidat pas encore possédé — jamais deviné', async () => {
    const { service } = await build([])
    const [result] = await service.resolve('user-1', [candidate('326300159')])
    expect(result).toEqual({ portfolioState: 'new', accountId: null })
  })

  it('reste sans logo quand le compte possédé n’en porte pas — jamais un logo inventé', async () => {
    const { service } = await build([
      { id: 'acc-8', siren: '552081317', company_name: 'ACME', status: 'completed', commercial_status: 'inbox' },
    ])
    const [result] = await service.resolve('user-1', [candidate('552081317')])
    expect(result).toEqual({ portfolioState: 'analyzed', accountId: 'acc-8' })
  })

  it('degrades to new rather than failing the run when the lookup throws', async () => {
    // Discover is a read-only, free screen: a portfolio hiccup must not 500 it.
    const { service, repo } = await build([])
    repo.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down')
    })
    expect(await service.resolve('user-1', [candidate('552081317')])).toEqual([
      { portfolioState: 'new', accountId: null },
    ])
  })
})

/**
 * #3819.1 — « besoins connus » : une SEULE requête (groupée) pour toute la
 * page, jamais un appel par carte. `knownNeedsCount` rend un fait MESURÉ
 * (`0` inclus) pour un compte déjà possédé, et reste `undefined` pour un
 * candidat neuf (rien à connaître) ou quand la requête échoue (non cherché,
 * jamais un `0` deviné — GA-18/19).
 */
describe('DiscoverPortfolioService — resolveKnownNeeds (#3819.1)', () => {
  it('reste undefined pour un candidat sans compte — rien à connaître', async () => {
    const { service } = await build([], [])
    const result = await service.resolveKnownNeeds([{ accountId: null }])
    expect(result).toEqual([undefined])
  })

  it('rend 0 — un fait mesuré, pas une absence — pour un compte sans besoin ouvert', async () => {
    const { service } = await build([], [])
    const result = await service.resolveKnownNeeds([{ accountId: 'acc-1' }])
    expect(result).toEqual([0])
  })

  it('compte les besoins ouverts de chaque compte, dans l’ordre reçu', async () => {
    const { service } = await build(
      [],
      [
        { accountId: 'acc-1', count: '3' },
        { accountId: 'acc-2', count: '1' },
      ],
    )
    const result = await service.resolveKnownNeeds([
      { accountId: 'acc-2' },
      { accountId: null },
      { accountId: 'acc-1' },
    ])
    expect(result).toEqual([1, undefined, 3])
  })

  it('#3819.1 — ajoute les besoins que l’ANALYSE a produits (douleurs, chantiers IT, programmes) : un compte analysé sans besoin de staffing n’est plus « 0 »', async () => {
    const { service } = await build(
      [],
      [{ accountId: 'acc-1', count: '1' }],
      [
        { accountId: 'acc-1', count: '4' },
        { accountId: 'acc-2', count: '2' },
      ],
    )
    const result = await service.resolveKnownNeeds([
      { accountId: 'acc-1' },
      { accountId: 'acc-2' },
      { accountId: 'acc-3' },
    ])
    expect(result).toEqual([5, 2, 0])
  })

  it('#3819.1 — une panne de la lecture de l’analyse rend « non cherché », jamais un compte partiel', async () => {
    const { service } = await build([], [{ accountId: 'acc-1', count: '1' }], null)
    expect(await service.resolveKnownNeeds([{ accountId: 'acc-1' }])).toEqual([undefined])
  })

  it('ne tente aucune requête sans aucun compte à résoudre', async () => {
    const { service, needsRepo, manager } = await build([], [])
    await service.resolveKnownNeeds([{ accountId: null }, { accountId: null }])
    expect(needsRepo.createQueryBuilder).not.toHaveBeenCalled()
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('une panne de la requête rend « non cherché » (undefined), jamais 0 deviné', async () => {
    const { service } = await build([], null)
    const result = await service.resolveKnownNeeds([{ accountId: 'acc-1' }])
    expect(result).toEqual([undefined])
  })
})

describe('DiscoverPortfolioService — resolveKnownNeedFacts (#4068, lot DECOUVRIR-CARTE)', () => {
  it('rend les besoins connus eux-mêmes, datés, du plus récent au plus ancien, trois au plus', async () => {
    const { service, manager } = await build([], [])
    manager.query.mockResolvedValue([
      { accountId: 'acc-1', label: 'Refonte du MES', at: '2026-06-01T10:00:00Z', isDetection: false },
      { accountId: 'acc-1', label: ' ', at: '2026-10-01T10:00:00Z', isDetection: true },
      { accountId: 'acc-1', label: 'Migration cloud des usines', at: '2026-09-15T10:00:00Z', isDetection: true },
      { accountId: 'acc-1', label: 'Cybersécurité OT', at: '2026-09-15T10:00:00Z', isDetection: true },
      { accountId: 'acc-1', label: 'Support bureautique', at: '2026-01-15T10:00:00Z', isDetection: false },
      { accountId: 'acc-2', label: 'TMA achats', at: new Date('2026-08-01T00:00:00Z'), isDetection: false },
    ])
    const result = await service.resolveKnownNeedFacts([
      { accountId: 'acc-1' },
      { accountId: null },
      { accountId: 'acc-2' },
    ])
    expect(result[0]).toEqual([
      { label: 'Migration cloud des usines', date: '2026-09-15', dateIsDetection: true },
      { label: 'Cybersécurité OT', date: '2026-09-15', dateIsDetection: true },
      { label: 'Refonte du MES', date: '2026-06-01' },
    ])
    expect(result[1]).toBeUndefined()
    expect(result[2]).toEqual([{ label: 'TMA achats', date: '2026-08-01' }])
  })

  it('aucune requête sans compte ; une panne rend « non cherché », jamais une liste vide devinée', async () => {
    const { service, manager } = await build([], [])
    expect(await service.resolveKnownNeedFacts([{ accountId: null }])).toEqual([undefined])
    expect(manager.query).not.toHaveBeenCalled()
    manager.query.mockRejectedValue(new Error('db down'))
    expect(await service.resolveKnownNeedFacts([{ accountId: 'acc-1' }])).toEqual([undefined])
  })
})
