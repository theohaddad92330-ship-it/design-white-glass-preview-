import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import { NEEDS_HISTORY_MAX_CALLS_PER_TURN, NEEDS_HISTORY_MAX_ROWS_PER_CALL } from './needs-history.limits'
import { NeedsHistoryService } from './needs-history.service'

const ID = '11111111-1111-4111-8111-111111111111'

function serviceOf(jobs: unknown[], history: unknown[] = [], known = true) {
  const query = jest
    .fn()
    .mockResolvedValueOnce(known ? [{ id: ID, jobs }] : [])
    .mockResolvedValueOnce(history)
  const repo = { manager: { query } } as unknown as Repository<AccountEntity>
  return { service: new NeedsHistoryService(repo), query }
}

describe('NeedsHistoryService — l’outil de requête de Laura (#4759)', () => {
  it('cloisonne par espace : la requête porte workspace_id et ne cible que le compte demandé', async () => {
    const { service, query } = serviceOf([])
    await service.query({ workspaceId: 'ws-1', userId: 'u-1', accountId: ID, filter: {} })
    expect(query.mock.calls[0][0]).toContain('a.workspace_id = $1')
    expect(query.mock.calls[0][1]).toEqual(['ws-1', [ID]])
  })

  it('compte hors espace → null, jamais l’offre d’un autre client', async () => {
    const { service } = serviceOf([], [], false)
    expect(await service.query({ workspaceId: 'ws-1', userId: 'u-1', accountId: ID, filter: {} })).toBeNull()
  })

  it('plafonne la page au plafond NOMMÉ, pagine, et dit qu’il en reste', async () => {
    const jobs = Array.from({ length: 40 }, (_, i) => ({ title: `Dev ${i}`, date: '2026-01-01', skills: ['Java'] }))
    const { service } = serviceOf(jobs)
    const page = await service.query({ workspaceId: 'ws-1', userId: 'u-1', accountId: ID, filter: { limit: 999 } })
    expect(page?.rows).toHaveLength(NEEDS_HISTORY_MAX_ROWS_PER_CALL)
    expect(page?.total).toBe(40)
    expect(page?.hasMore).toBe(true)
    expect(page?.maxCallsPerTurn).toBe(NEEDS_HISTORY_MAX_CALLS_PER_TURN)
  })

  it('journalise chaque appel (plafond, volume), sans le contenu des offres', async () => {
    const { service } = serviceOf([{ title: 'Secret Java', date: '2026-01-01' }])
    const log = jest.spyOn(service['logger'], 'log').mockImplementation()
    await service.query({ workspaceId: 'ws-1', userId: 'u-1', accountId: ID, filter: { limit: 5 } })
    const line = String(log.mock.calls[0]?.[0])
    expect(line).toContain('needs_history.query')
    expect(line).toContain('limit=5')
    expect(line).not.toContain('Secret Java')
  })

  it('l’agrégat du contexte : deux requêtes pour tous les comptes', async () => {
    const { service, query } = serviceOf([{ title: 'Lead Java', date: '2025-11-12', skills: ['Java'] }])
    const map = await service.aggregateFor('ws-1', [ID])
    expect(query).toHaveBeenCalledTimes(2)
    expect(map.get(ID)).toMatchObject({ count: 1, lastNeedAt: '2025-11-12', topTechs: ['Java'] })
  })
})
