import { createMockRepository } from '../../database/test-utils'
import { RitualPreferencesService } from './ritual-preferences.service'

/**
 * BEL-SC-242 (#3271.10, .12) — « laisser le workspace personnaliser » sans
 * jamais supprimer : une préférence ABSENTE veut dire « rituel affiché »,
 * jamais « rituel désactivé » par défaut — même arbitrage que
 * `FinanceTargetService` pour « aucun objectif saisi ».
 */
describe('RitualPreferencesService', () => {
  function build(rows: Array<Record<string, unknown>>) {
    const repo = createMockRepository()
    repo.find.mockResolvedValue(rows)
    repo.query.mockResolvedValue([])
    return { service: new RitualPreferencesService(repo as never), repo }
  }

  it('rend un tableau VIDE quand rien n’a jamais été réglé — aucun rituel désactivé par défaut', async () => {
    const { service } = build([])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([])
  })

  it('rend chaque préférence réglée, ritualKey et disabled', async () => {
    const { service } = build([{ ritual_key: 'weekly', disabled: true }])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([{ ritualKey: 'weekly', disabled: true }])
  })

  it('la SAISIE fait un UPSERT — une seule ligne par (espace, rituel), la dernière décision gagne', async () => {
    const { service, repo } = build([])
    repo.findOne.mockResolvedValue({ ritual_key: 'weekly', disabled: true })

    const saved = await service.set('ws-1', 'weekly', true, 'user-9')
    expect(saved).toEqual({ ritualKey: 'weekly', disabled: true })

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (workspace_id, ritual_key)')
    expect(sql).toContain('DO UPDATE')
    expect(params).toEqual(['ws-1', 'weekly', true, 'user-9'])
  })

  it('réactiver (disabled: false) reste une SAISIE, jamais une suppression de la ligne — on archive, on ne supprime pas', async () => {
    const { service, repo } = build([])
    repo.findOne.mockResolvedValue({ ritual_key: 'weekly', disabled: false })

    await service.set('ws-1', 'weekly', false, 'user-9')
    expect(repo.delete).not.toHaveBeenCalled()
    expect(repo.query).toHaveBeenCalled()
  })
})
