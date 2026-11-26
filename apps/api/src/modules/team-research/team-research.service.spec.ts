import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TeamResearchEntryEntity } from '../../database/entities/team-research-entry.entity'
import { TeamResearchService, filtersKeyOf } from './team-research.service'

// Théo D team-recherches.N1/N2 — l'historique d'équipe : Découvrir + analyses de compte.
describe('TeamResearchService', () => {
  const query = jest.fn()
  const upsert = jest.fn()
  let service: TeamResearchService

  beforeEach(async () => {
    jest.resetAllMocks()
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamResearchService,
        { provide: getRepositoryToken(TeamResearchEntryEntity), useValue: { manager: { query }, upsert } },
      ],
    }).compile()
    service = moduleRef.get(TeamResearchService)
  })

  it('un simple membre lit les recherches de toute l’équipe (Q3), plus récentes d’abord', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 'd1',
          title: 'SAP · France',
          scopeLabel: 'France · Tous secteurs',
          filters: { skills: ['SAP'] },
          resultCount: 8,
          openActions: 3,
          userId: 'u2',
          firstName: 'Maëlle',
          lastName: 'Lorquin',
          at: new Date('2026-10-15T08:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'a1',
          accountId: 'acc-1',
          title: 'Société Générale',
          scopeLabel: 'group',
          openActions: 1,
          nextAction: 'Préparer le rendez-vous de cadrage',
          userId: 'u1',
          firstName: 'Léa',
          lastName: 'Marchand',
          at: new Date('2026-10-18T08:00:00Z'),
        },
      ])

    const { items } = await service.list('ws-1')

    expect(items.map(i => i.id)).toEqual(['a1', 'd1'])
    expect(items[0]).toMatchObject({
      kind: 'analysis',
      account_count: 1,
      next_action: 'Préparer le rendez-vous de cadrage',
    })
    expect(items[1]).toMatchObject({
      kind: 'discover',
      account_count: 8,
      open_action_count: 3,
      author_name: 'Maëlle Lorquin',
    })
    // Les deux lectures sont bornées à l'espace actif.
    expect(query.mock.calls.every(call => call[1][0] === 'ws-1')).toBe(true)
  })

  it('le filtre « discover » ne lit pas les analyses', async () => {
    query.mockResolvedValueOnce([])
    const { items } = await service.list('ws-1', 'discover')
    expect(items).toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('un nombre de comptes absent reste null, jamais 0', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 'd2',
          title: 'Data',
          scopeLabel: null,
          filters: {},
          resultCount: null,
          openActions: 0,
          userId: 'u2',
          firstName: null,
          lastName: null,
          at: new Date(),
        },
      ])
      .mockResolvedValueOnce([])
    const { items } = await service.list('ws-1')
    expect(items[0]).toMatchObject({ account_count: null, open_action_count: 0, author_name: null, scope_label: null })
  })

  it('enregistre une recherche lancée : une relance du même périmètre remonte la ligne', async () => {
    await service.record('ws-1', 'u1', { title: 'SAP · France', filters: { skills: ['SAP'] }, result_count: 8 })
    expect(upsert).toHaveBeenCalledTimes(1)
    const [row, conflict] = upsert.mock.calls[0]
    expect(row).toMatchObject({ workspace_id: 'ws-1', user_id: 'u1', title: 'SAP · France', result_count: 8 })
    expect(row.filters_key).toBe(filtersKeyOf({ skills: ['SAP'] }))
    expect(conflict).toEqual(['workspace_id', 'user_id', 'filters_key'])
  })

  it('l’empreinte ignore l’ordre des clés', () => {
    expect(filtersKeyOf({ a: 1, b: 2 })).toBe(filtersKeyOf({ b: 2, a: 1 }))
  })
})
