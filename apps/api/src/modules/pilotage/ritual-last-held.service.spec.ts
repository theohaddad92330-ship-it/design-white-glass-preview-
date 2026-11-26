import { createMockRepository } from '../../database/test-utils'
import { RitualLastHeldService } from './ritual-last-held.service'

/**
 * #3298 (suite #3271.8) — la marque légère « ce rituel a été tenu » : une
 * marque ABSENTE veut dire « jamais tenu », jamais une date INVENTÉE depuis
 * la seule cadence — même arbitrage que `RitualPreferencesService`.
 */
describe('RitualLastHeldService', () => {
  function build(rows: Array<Record<string, unknown>>) {
    const repo = createMockRepository()
    repo.find.mockResolvedValue(rows)
    repo.query.mockResolvedValue([])
    return { service: new RitualLastHeldService(repo as never), repo }
  }

  it('rend un tableau VIDE quand aucun rituel n’a jamais été marqué tenu', async () => {
    const { service } = build([])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([])
  })

  it('rend chaque marque réglée, ritualKey/heldAt/heldBy', async () => {
    const { service } = build([
      { ritual_key: 'monthly', held_at: new Date('2026-09-29T10:00:00.000Z'), held_by: 'user-9' },
    ])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([
      { ritualKey: 'monthly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'user-9' },
    ])
  })

  it('marquer tenu fait un UPSERT — une seule marque par (espace, rituel), la dernière tenue gagne', async () => {
    const { service, repo } = build([])
    repo.findOne.mockResolvedValue({
      ritual_key: 'monthly',
      held_at: new Date('2026-09-29T10:00:00.000Z'),
      held_by: 'user-9',
    })

    const saved = await service.markHeld('ws-1', 'monthly', 'user-9')
    expect(saved).toEqual({ ritualKey: 'monthly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'user-9' })

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (workspace_id, ritual_key)')
    expect(sql).toContain('DO UPDATE')
    expect(params).toEqual(['ws-1', 'monthly', 'user-9'])
  })

  it('ne supprime jamais la marque précédente — un nouveau marquage la REMPLACE, on archive, on ne supprime pas', async () => {
    const { service, repo } = build([])
    repo.findOne.mockResolvedValue({ ritual_key: 'monthly', held_at: new Date(), held_by: 'user-9' })

    await service.markHeld('ws-1', 'monthly', 'user-9')
    expect(repo.delete).not.toHaveBeenCalled()
    expect(repo.query).toHaveBeenCalled()
  })
})
