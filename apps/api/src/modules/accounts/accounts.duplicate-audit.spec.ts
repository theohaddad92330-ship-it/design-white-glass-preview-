import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const row = (over: Record<string, unknown>) => ({
  id: 'x',
  company_name: 'Veolia',
  siren: null,
  status: 'completed',
  merged_into_id: null,
  keep: true,
  has_contacts: true,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

// #4294.9 — l'audit des doublons est une LECTURE, cloisonnée par l'espace, qui ne compte pas les coquilles vides.
describe('AccountsService.auditDuplicates', () => {
  let repo: MockRepository<AccountEntity>
  let service: AccountsService

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
  })

  it('REFUS : ne lit que l’espace demandé, ne passe aucune écriture, et reprend le prédicat de la liste', async () => {
    repo.manager.query.mockResolvedValue([])

    await service.auditDuplicates('w1')

    expect(repo.manager.query).toHaveBeenCalledTimes(1)
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('account.workspace_id = $1')
    expect(params[0]).toBe('w1')
    expect(sql).toContain('keep-non-empty-failed')
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/i)
  })

  it('applique le périmètre d’unité quand il y en a un', async () => {
    repo.manager.query.mockResolvedValue([])
    await service.auditDuplicates('w1', { businessUnitIds: ['bu1'], includeUnassigned: true })
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('account.business_unit_id')
    expect(params[2]).toEqual(['bu1'])
  })

  it('1 022 coquilles vides ne fabriquent aucun doublon ; les vrais doublons se comptent', async () => {
    const shells = Array.from({ length: 5 }, (_, i) =>
      row({ id: `s${i}`, company_name: 'Veolia', status: 'error', keep: false, has_contacts: false }),
    )
    repo.manager.query.mockResolvedValue([
      row({ id: 'a', company_name: 'Veolia', siren: '403210032' }),
      row({ id: 'b', company_name: 'Veolia Environnement', siren: '403 210 032' }),
      ...shells,
    ])

    const out = await service.auditDuplicates('w1')

    expect(out.emptyShells).toBe(5)
    expect(out.examined).toBe(2)
    expect(out.wouldAbsorb).toBe(1)
    expect(out.groups).toHaveLength(1)
  })
})
