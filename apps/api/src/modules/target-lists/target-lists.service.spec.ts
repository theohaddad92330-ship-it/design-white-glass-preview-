import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { TargetListEntity } from '../../database/entities/target-list.entity'
import type { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TargetListsService } from './target-lists.service'

const LIST: TargetListEntity = {
  id: 'list-1',
  workspace_id: 'ws-1',
  created_by: 'u1',
  name: 'Banques — T4',
  objective: 'Décrocher 3 rendez-vous DSI',
  owner_user_id: null,
  team: null,
  visibility: 'workspace',
  source: 'manual',
  source_query: null,
  status: 'draft',
  next_action: null,
  sequence_id: null,
  prospecting_session_id: null,
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-02T00:00:00.000Z'),
}

/** Une ligne telle que la jointure la rend — les libellés viennent de la fiche. */
function itemRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'i1',
    target_list_id: 'list-1',
    account_id: 'acc-1',
    contact_id: null,
    account_name: 'Banque Alpha',
    contact_name: null,
    contact_company: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'manual',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: new Date('2026-09-03T00:00:00.000Z'),
    updated_at: new Date('2026-09-03T00:00:00.000Z'),
    ...over,
  }
}

describe('TargetListsService — #2155.13 à .21', () => {
  let lists: MockRepository<TargetListEntity>
  let items: MockRepository<TargetListItemEntity>
  let dataSource: { query: jest.Mock }
  let workspaceContext: {
    resolveActiveWorkspace: jest.Mock
    assertMember: jest.Mock
    portfolioVisibilityOf: jest.Mock
  }
  let service: TargetListsService

  beforeEach(() => {
    lists = createMockRepository<TargetListEntity>()
    items = createMockRepository<TargetListItemEntity>()
    dataSource = { query: jest.fn(async () => []) }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      assertMember: jest.fn().mockResolvedValue({}),
      portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
    }
    service = new TargetListsService(
      lists as never,
      items as never,
      dataSource as never,
      workspaceContext as unknown as WorkspaceContextService,
    )
  })

  it('lit les listes de l’espace et le libellé SUR la fiche canonique (#2155.15)', async () => {
    lists.find.mockResolvedValue([LIST])
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'i1',
        target_list_id: 'list-1',
        account_id: 'acc-1',
        contact_id: null,
        account_name: 'Banque Alpha',
        contact_name: null,
        contact_company: null,
        priority: 'high',
        owner_user_id: 'u2',
        work_status: 'to_review',
        provenance: 'discover',
        next_action: 'Appeler la DSI',
        created_at: new Date('2026-09-03T00:00:00.000Z'),
        updated_at: new Date('2026-09-03T00:00:00.000Z'),
      },
      {
        id: 'i2',
        target_list_id: 'list-1',
        account_id: null,
        contact_id: 'ct-1',
        account_name: null,
        contact_name: 'Claire Martin',
        contact_company: 'Banque Alpha',
        priority: null,
        owner_user_id: null,
        work_status: 'in_progress',
        provenance: 'manual',
        next_action: null,
        created_at: new Date('2026-09-03T00:00:00.000Z'),
        updated_at: new Date('2026-09-03T00:00:00.000Z'),
      },
    ])

    const result = await service.list('u1')

    // #2156.11 — la lecture porte la visibilité : l'espace, ou ce que j'ai créé.
    expect(lists.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { workspace_id: 'ws-1', visibility: 'workspace' },
          { workspace_id: 'ws-1', created_by: 'u1' },
        ],
      }),
    )
    expect(result.lists[0]?.objective).toBe('Décrocher 3 rendez-vous DSI')
    expect(result.lists[0]?.items).toEqual([
      expect.objectContaining({ kind: 'account', ref_id: 'acc-1', label: 'Banque Alpha', sublabel: null }),
      expect.objectContaining({ kind: 'contact', ref_id: 'ct-1', label: 'Claire Martin', sublabel: 'Banque Alpha' }),
    ])
    // Une priorité non posée reste `null` — jamais « basse ».
    expect(result.lists[0]?.items[1]?.priority).toBeNull()
  })

  it('retirer un élément ne supprime JAMAIS la fiche canonique (#2155.14 / #2156.31)', async () => {
    lists.findOne.mockResolvedValue(LIST)
    const row = { id: 'i1', target_list_id: 'list-1', workspace_id: 'ws-1' } as TargetListItemEntity
    items.findOne.mockResolvedValue(row)

    await service.removeItem('u1', 'list-1', 'i1', { reason: 'Déjà client' })

    // On archive, on ne supprime pas : ni la fiche, ni même la ligne de liste.
    expect(items.delete).not.toHaveBeenCalled()
    expect(items.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'i1', removal_reason: 'Déjà client', removed_at: expect.any(Date) }),
    )
    const deletes = dataSource.query.mock.calls.map(call => String(call[0])).filter(sql => /DELETE/i.test(sql))
    expect(deletes).toEqual([])
  })

  it('refuse une fiche hors de l’espace — pas de référence vers ce qu’on ne voit pas', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([])

    await expect(service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-x' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(items.save).not.toHaveBeenCalled()
  })

  it('applique le cloisonnement de portefeuille à l’ajout d’un compte', async () => {
    workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([])

    await expect(service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-x' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('assigned_to')
    expect(params).toContain('u1')
  })

  it('refuse le même compte deux fois dans la même liste', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }])
    items.findOne.mockResolvedValue({ id: 'i1' })

    await expect(service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-1' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('refuse un owner qui n’est pas membre de l’espace (#2155.18)', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }])
    items.findOne.mockResolvedValue(null)
    workspaceContext.assertMember.mockImplementation(async (userId: string) => {
      if (userId === 'stranger') throw new Error('not a member')
      return {}
    })

    await expect(
      service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-1', owner_user_id: 'stranger' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('écrit la provenance « ajout manuel » par défaut, et le statut « à vérifier » (#2155.19/.20)', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }]).mockResolvedValueOnce([
      {
        id: 'i9',
        target_list_id: 'list-1',
        account_id: 'acc-1',
        contact_id: null,
        account_name: 'Banque Alpha',
        contact_name: null,
        contact_company: null,
        priority: null,
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'manual',
        next_action: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])
    items.findOne.mockResolvedValue(null)
    items.save.mockImplementation(async (row: TargetListItemEntity) => ({ ...row, id: 'i9' }))

    const created = await service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-1' })

    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acc-1',
        contact_id: null,
        provenance: 'manual',
        work_status: 'to_review',
      }),
    )
    expect(created).toMatchObject({ id: 'i9', kind: 'account', label: 'Banque Alpha' })
  })

  it('#3753 — garde la lettre du tier et les hypothèses du vendeur, sans rien déduire', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }]).mockResolvedValueOnce([
      itemRow({
        id: 'i9',
        priority: 'high',
        tier_label: 'A',
        seller_hypotheses: { addressable_issues: 'Migration cloud', upcoming_it_projects: null },
      }),
    ])
    items.findOne.mockResolvedValue(null)
    items.save.mockImplementation(async (row: TargetListItemEntity) => ({ ...row, id: 'i9' }))

    const created = await service.addItem('u1', 'list-1', {
      kind: 'account',
      ref_id: 'acc-1',
      priority: 'high',
      tier_label: 'A',
      seller_hypotheses: { addressable_issues: 'Migration cloud', upcoming_it_projects: null },
    })

    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tier_label: 'A',
        seller_hypotheses: { addressable_issues: 'Migration cloud', upcoming_it_projects: null },
      }),
    )
    expect(created.tier_label).toBe('A')
    expect(created.seller_hypotheses).toEqual({ addressable_issues: 'Migration cloud', upcoming_it_projects: null })
  })

  it('#3753 — un élément sans tier ne porte AUCUN tier (null, jamais « C » par défaut)', async () => {
    lists.findOne.mockResolvedValue(LIST)
    dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }]).mockResolvedValueOnce([itemRow({ id: 'i9' })])
    items.findOne.mockResolvedValue(null)
    items.save.mockImplementation(async (row: TargetListItemEntity) => ({ ...row, id: 'i9' }))

    const created = await service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-1' })

    expect(items.create).toHaveBeenCalledWith(expect.objectContaining({ tier_label: null, seller_hypotheses: null }))
    expect(created.tier_label).toBeNull()
    expect(created.seller_hypotheses).toBeNull()
  })

  it('ne modifie pas un élément d’une liste d’un autre espace', async () => {
    lists.findOne.mockResolvedValue(null)
    await expect(service.updateItem('u1', 'list-2', 'i1', { work_status: 'done' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(lists.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'list-2', workspace_id: 'ws-1', visibility: 'workspace' },
        { id: 'list-2', workspace_id: 'ws-1', created_by: 'u1' },
      ],
    })
  })

  it('ne cherche rien sous deux caractères — et jamais hors de l’espace', async () => {
    expect(await service.candidates('u1', 'a')).toEqual({ candidates: [] })
    expect(dataSource.query).not.toHaveBeenCalled()

    await service.candidates('u1', 'alp%')
    for (const [sql, params] of dataSource.query.mock.calls as [string, unknown[]][]) {
      expect(sql).toContain('workspace_id = $1')
      expect(params[0]).toBe('ws-1')
      // Le joker tapé par l'utilisateur est échappé, pas interprété.
      expect(params[1]).toBe('%alp\\%%')
    }
  })
})

describe('TargetListsService — le modèle #2156', () => {
  let lists: MockRepository<TargetListEntity>
  let items: MockRepository<TargetListItemEntity>
  let dataSource: { query: jest.Mock }
  let workspaceContext: {
    resolveActiveWorkspace: jest.Mock
    assertMember: jest.Mock
    portfolioVisibilityOf: jest.Mock
  }
  let service: TargetListsService

  beforeEach(() => {
    lists = createMockRepository<TargetListEntity>()
    items = createMockRepository<TargetListItemEntity>()
    dataSource = { query: jest.fn(async () => []) }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      assertMember: jest.fn().mockResolvedValue({}),
      portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
    }
    service = new TargetListsService(
      lists as never,
      items as never,
      dataSource as never,
      workspaceContext as unknown as WorkspaceContextService,
    )
  })

  describe('la visibilité est une AUTORISATION, pas un affichage (#2156.11)', () => {
    it('une liste privée d’un autre membre ne sort pas de la requête de l’espace', async () => {
      lists.find.mockResolvedValue([])

      await service.list('u2')

      const where = (lists.find.mock.calls[0]?.[0] as { where: Record<string, unknown>[] }).where
      // Deux branches, et seulement deux : ce que l'espace partage, et ce que
      // l'appelant a créé lui-même.
      expect(where).toEqual([
        { workspace_id: 'ws-1', visibility: 'workspace' },
        { workspace_id: 'ws-1', created_by: 'u2' },
      ])
    })

    it('une liste privée n’est pas non plus atteignable PAR SON ID', async () => {
      lists.findOne.mockResolvedValue(null)

      await expect(service.updateList('u2', 'list-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException)

      const where = (lists.findOne.mock.calls[0]?.[0] as { where: Record<string, unknown>[] }).where
      expect(where).toEqual([
        { id: 'list-1', workspace_id: 'ws-1', visibility: 'workspace' },
        { id: 'list-1', workspace_id: 'ws-1', created_by: 'u2' },
      ])
    })

    it('son auteur, lui, la retrouve', async () => {
      lists.find.mockResolvedValue([{ ...LIST, visibility: 'private', created_by: 'u1' }])

      const result = await service.list('u1')

      expect(result.lists[0]?.visibility).toBe('private')
    })
  })

  describe('les compteurs (#2156.17 à .19)', () => {
    it('sont mesurés quand la liste est lue en entier', async () => {
      lists.find.mockResolvedValue([LIST])
      dataSource.query.mockResolvedValueOnce([
        itemRow({ id: 'i1', work_status: 'to_review' }),
        itemRow({ id: 'i2', work_status: 'ready_to_contact' }),
      ])

      const result = await service.list('u1')

      expect(result.lists[0]?.counts).toEqual({ measured: true, total: 2, ready_to_work: 1, to_review: 1 })
      expect(result.lists[0]?.type).toBe('accounts')
    })

    it('ne sont PAS mesurés quand le cloisonnement masque une partie des comptes — et surtout pas « 0 »', async () => {
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      lists.find.mockResolvedValue([LIST])
      dataSource.query.mockResolvedValueOnce([itemRow({ id: 'i1' })])

      const result = await service.list('u1')

      expect(result.lists[0]?.counts).toEqual({ measured: false, gap: 'portfolio_restricted' })
    })
  })

  describe('le retrait garde sa trace (#2156.31)', () => {
    it('un élément retiré ne revient pas dans la liste', async () => {
      lists.find.mockResolvedValue([LIST])
      dataSource.query.mockResolvedValueOnce([])

      await service.list('u1')

      const [sql] = dataSource.query.mock.calls[0] as [string]
      expect(sql).toContain('i.removed_at IS NULL')
    })

    it('la même fiche peut revenir dans la liste après avoir été retirée', async () => {
      lists.findOne.mockResolvedValue(LIST)
      dataSource.query.mockResolvedValueOnce([{ id: 'acc-1' }]).mockResolvedValueOnce([itemRow({ id: 'i9' })])
      items.findOne.mockResolvedValue(null)
      items.save.mockImplementation(async (row: TargetListItemEntity) => ({ ...row, id: 'i9' }))

      await service.addItem('u1', 'list-1', { kind: 'account', ref_id: 'acc-1' })

      // Le doublon ne se cherche que parmi les éléments ENCORE dans la liste.
      const where = (items.findOne.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where
      expect(where).toHaveProperty('removed_at')
    })
  })

  describe('les champs de la liste (#2156.9 à .22)', () => {
    it('une liste neuve est un brouillon, d’espace, saisie à la main', async () => {
      lists.save.mockImplementation(async (row: TargetListEntity) => ({ ...LIST, ...row }))

      await service.createList('u1', { name: 'Assurances' })

      expect(lists.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft', visibility: 'workspace', source: 'manual' }),
      )
    })

    // #2157.22 — changer l'owner depuis l'aperçu : seulement vers un membre du même espace.
    it('refuse à la création un owner hors de l’espace, sans rien écrire (#2157.22)', async () => {
      workspaceContext.assertMember.mockImplementation(async (userId: string) => {
        if (userId === 'stranger') throw new Error('not a member')
        return {}
      })

      await expect(service.createList('u1', { name: 'Assurances', owner_user_id: 'stranger' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(lists.save).not.toHaveBeenCalled()
    })

    it('accepte un owner membre de l’espace et la visibilité choisie (#2157.22/.23)', async () => {
      lists.save.mockImplementation(async (row: TargetListEntity) => ({ ...LIST, ...row }))

      await service.createList('u1', { name: 'Assurances', owner_user_id: 'u2', visibility: 'private' })

      expect(lists.create).toHaveBeenCalledWith(expect.objectContaining({ owner_user_id: 'u2', visibility: 'private' }))
    })

    it('garde la requête d’origine et le rattachement quand on les donne (#2156.13 / .21)', async () => {
      lists.save.mockImplementation(async (row: TargetListEntity) => ({ ...LIST, ...row }))

      await service.createList('u1', {
        name: 'Découverte banque',
        source: 'discover',
        source_query: { secteur: 'banque', effectif: '500+' },
        team: 'BU Finance',
        sequence_id: '00000000-0000-4000-8000-000000000001',
      })

      expect(lists.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'discover',
          source_query: { secteur: 'banque', effectif: '500+' },
          team: 'BU Finance',
          sequence_id: '00000000-0000-4000-8000-000000000001',
        }),
      )
    })

    it('le statut de la liste se corrige, archivage compris (#2156.34 à .40)', async () => {
      lists.findOne.mockResolvedValue({ ...LIST })
      lists.save.mockImplementation(async (row: TargetListEntity) => row)

      await service.updateList('u1', 'list-1', { status: 'archived' })

      expect(lists.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }))
    })
  })
})

// #4072.5
describe('TargetListsService — #4072.5 les 3 faits récents de chaque cible', () => {
  const build = (forAccount: jest.Mock | undefined, reader?: Record<string, jest.Mock>) => {
    const lists = createMockRepository<TargetListEntity>()
    lists.find.mockResolvedValue([LIST])
    const dataSource = {
      query: jest.fn(async () => [
        itemRow({ id: 'i1', account_id: 'acc-1' }),
        itemRow({ id: 'i2', account_id: 'acc-2', account_name: 'Banque Beta' }),
        itemRow({ id: 'i3', account_id: null, contact_id: 'c1', contact_name: 'Jeanne', contact_company: 'X' }),
      ]),
    }
    const service = new TargetListsService(
      lists as never,
      createMockRepository<TargetListItemEntity>() as never,
      dataSource as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as unknown as WorkspaceContextService,
      reader ? (reader as never) : forAccount ? ({ forAccount } as never) : undefined,
    )
    return service
  }
  const fact = (n: number) => ({ date: `2026-0${n}-01`, kind: 'signal', label: `f${n}`, weight: 1, ageDays: 10 })

  it('porte, par compte, les 3 faits les plus récents lus par le lecteur unique (jamais un second)', async () => {
    const forAccount = jest.fn(async (a: { accountId: string }) =>
      a.accountId === 'acc-1' ? { asOf: 'x', facts: [fact(1), fact(5), fact(3), fact(4)] } : null,
    )
    const res = await build(forAccount).list('u1')
    const [a, b, c] = res.lists[0]!.items
    expect(a!.recent_facts?.map(f => f.label)).toEqual(['f5', 'f4', 'f3'])
    expect(forAccount).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', userId: 'u1', accountId: 'acc-1' }),
    )
    // Une absence ne fait aucune ligne : ni tableau vide, ni « 0 fait ».
    expect(b!.recent_facts).toBeUndefined()
    expect(c!.recent_facts).toBeUndefined()
  })

  it('lit les faits de TOUS les comptes en UN appel groupé quand le lecteur le porte (pas un appel par compte)', async () => {
    const forAccount = jest.fn()
    const forAccounts = jest.fn(async () => new Map([['acc-1', { asOf: 'x', facts: [fact(2)] }]]))
    const service = build(undefined, { forAccount, forAccounts })
    const res = await service.list('u1')
    expect(forAccounts).toHaveBeenCalledTimes(1)
    expect(forAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', userId: 'u1', accountIds: ['acc-1', 'acc-2'] }),
    )
    expect(forAccount).not.toHaveBeenCalled()
    const [a, b] = res.lists[0]!.items
    expect(a!.recent_facts?.map(f => f.label)).toEqual(['f2'])
    expect(b!.recent_facts).toBeUndefined()
  })

  it('une lecture en panne ne casse pas la liste', async () => {
    const res = await build(jest.fn().mockRejectedValue(new Error('boom'))).list('u1')
    expect(res.lists[0]!.items).toHaveLength(3)
    expect(res.lists[0]!.items[0]!.recent_facts).toBeUndefined()
  })

  it('sans lecteur de faits, la liste est inchangée', async () => {
    const res = await build(undefined).list('u1')
    expect(res.lists[0]!.items[0]).not.toHaveProperty('recent_facts')
  })
})
