import { marginAttainment } from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { FinanceTargetService } from './finance-target.service'

/**
 * Ce que le réglage d'objectif doit tenir, maintenant que le refus est levé.
 *
 * Le revirement du 31/08/2026 autorise l'anneau ; il n'autorise pas à inventer
 * l'objectif. Chacun des tests ci-dessous garde une des trois moitiés que Louis
 * a explicitement conservées — pas d'objectif par défaut, pas de zéro, et la
 * dernière décision humaine gagne.
 */
describe('FinanceTargetService', () => {
  function build(row: Record<string, unknown> | null | Error) {
    const repo = createMockRepository()
    repo.findOne.mockImplementation(async () => {
      if (row instanceof Error) throw row
      return row
    })
    repo.query.mockResolvedValue([])
    repo.delete.mockResolvedValue({ affected: 1 })
    return { service: new FinanceTargetService(repo as never), repo }
  }

  it('rend « aucun objectif » quand rien n’a été saisi — jamais un défaut, jamais zéro', async () => {
    const { service } = build(null)
    await expect(service.forMonth('ws-1', '2026-08')).resolves.toEqual({
      month: '2026-08',
      targetPercent: null,
      setAt: null,
    })
  })

  it('convertit le `numeric` que le pilote remonte en CHAÎNE', async () => {
    // Sans cette conversion, `marginAttainment` verrait un `typeof !== 'number'`
    // et répondrait « aucun objectif saisi » sur un objectif parfaitement saisi.
    const { service } = build({
      month: '2026-08',
      target_percent: '25.00',
      updated_at: new Date('2026-08-30T10:00:00Z'),
    })
    const target = await service.forMonth('ws-1', '2026-08')
    expect(target.targetPercent).toBe(25)
    expect(target.setAt).toBe('2026-08-30T10:00:00.000Z')
    // La preuve que la conversion sert à quelque chose : la dérivation répond.
    expect(marginAttainment({ marginPercent: 20, targetPercent: target.targetPercent }).measured).toBe(true)
  })

  it('une valeur ILLISIBLE vaut une absence, jamais zéro', async () => {
    const { service } = build({ month: '2026-08', target_percent: 'douze', updated_at: null })
    await expect(service.forMonth('ws-1', '2026-08')).resolves.toEqual({
      month: '2026-08',
      targetPercent: null,
      setAt: null,
    })
  })

  it('une lecture EN ÉCHEC ne fabrique aucun objectif', async () => {
    const { service } = build(new Error('base injoignable'))
    await expect(service.forMonth('ws-1', '2026-08')).resolves.toEqual({
      month: '2026-08',
      targetPercent: null,
      setAt: null,
    })
  })

  it('la SAISIE remplace la précédente — une décision, pas une photo', async () => {
    const { service, repo } = build({
      month: '2026-08',
      target_percent: '30.00',
      updated_at: new Date('2026-08-31T08:00:00Z'),
    })
    const saved = await service.set('ws-1', '2026-08', 30, 'user-9')
    expect(saved.targetPercent).toBe(30)

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    // `DO UPDATE` et non `DO NOTHING` : l'inverse exact de la photo mensuelle
    // d'à côté, et les deux ont raison — un fait observé ne se réécrit pas, une
    // décision si.
    expect(sql).toContain('ON CONFLICT (workspace_id, month)')
    expect(sql).toContain('DO UPDATE')
    expect(sql).not.toContain('DO NOTHING')
    expect(params).toEqual(['ws-1', '2026-08', 30, 'user-9'])
  })

  it('EFFACER l’objectif supprime la ligne — on ne garde pas une cible que personne n’assume', async () => {
    const { service, repo } = build(null)
    await expect(service.set('ws-1', '2026-08', null, 'user-9')).resolves.toEqual({
      month: '2026-08',
      targetPercent: null,
      setAt: null,
    })
    expect(repo.delete).toHaveBeenCalledWith({ workspace_id: 'ws-1', month: '2026-08' })
    // Aucun INSERT : effacer n'écrit pas un zéro.
    expect(repo.query).not.toHaveBeenCalled()
  })
})
