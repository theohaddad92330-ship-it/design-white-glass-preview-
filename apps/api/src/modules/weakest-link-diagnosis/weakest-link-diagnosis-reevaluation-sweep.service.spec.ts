import { Logger } from '@nestjs/common'
import { DECIDED_STAGES, projectStageInSql } from '@bellum/contracts'
import { WeakestLinkDiagnosisReevaluationSweepService } from './weakest-link-diagnosis-reevaluation-sweep.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WeakestLinkDiagnosisEntity } from '../../database/entities/weakest-link-diagnosis.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333'

/**
 * #3253.c — le passage hebdomadaire qui rappelle `diagnoseFor` sans qu'un
 * commercial n'ait rouvert l'écran. L'événement significatif est LU des faits
 * horodatés (#3294), pas d'un bus.
 */
describe('WeakestLinkDiagnosisReevaluationSweepService', () => {
  let workspaces: MockRepository<WorkspaceEntity>
  let diagnoses: MockRepository<WeakestLinkDiagnosisEntity>
  let diagnoseFor: jest.Mock
  let service: WeakestLinkDiagnosisReevaluationSweepService

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    diagnoses = createMockRepository<WeakestLinkDiagnosisEntity>()
    diagnoseFor = jest.fn().mockResolvedValue(undefined)
    service = new WeakestLinkDiagnosisReevaluationSweepService(
      workspaces as never,
      diagnoses as never,
      { diagnoseFor } as never,
      (_name, run) => run(),
    )
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('rejoue un espace qui n’a JAMAIS eu de diagnostic — établir la première ligne n’attend pas un écran ouvert', async () => {
    workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID }])
    diagnoses.find.mockResolvedValue([])

    const report = await service.sweep(new Date('2026-09-30T06:00:00Z'))

    expect(diagnoseFor).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(report).toEqual({ examined: 1, reevaluated: 1 })
  })

  it('ne rejoue pas un espace réévalué il y a moins de sept jours', async () => {
    workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID }])
    diagnoses.find.mockResolvedValue([{ computed_at: new Date('2026-09-27T06:00:00Z') }])

    const report = await service.sweep(new Date('2026-09-30T06:00:00Z'))

    expect(diagnoseFor).not.toHaveBeenCalled()
    expect(report).toEqual({ examined: 1, reevaluated: 0 })
  })

  it('rejoue un espace dont le dernier diagnostic date de sept jours ou plus', async () => {
    workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID }])
    diagnoses.find.mockResolvedValue([{ computed_at: new Date('2026-09-20T06:00:00Z') }])

    const report = await service.sweep(new Date('2026-09-30T06:00:00Z'))

    expect(diagnoseFor).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(report).toEqual({ examined: 1, reevaluated: 1 })
  })

  it('#3294 — un événement significatif (affaire gagnée/perdue, mission terminée) rejoue un espace réévalué hier', async () => {
    workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID }])
    diagnoses.find.mockResolvedValue([{ computed_at: new Date('2026-09-29T06:00:00Z') }])
    diagnoses.manager.query.mockResolvedValue([{ happened: true }])

    const report = await service.sweep(new Date('2026-09-30T06:00:00Z'))

    expect(diagnoses.manager.query).toHaveBeenCalledWith(
      expect.stringContaining(projectStageInSql('stage', DECIDED_STAGES)),
      [WORKSPACE_ID, new Date('2026-09-29T06:00:00Z')],
    )
    const sql = diagnoses.manager.query.mock.calls[0][0] as string
    expect(sql).toContain('FROM opportunities')
    expect(sql).not.toContain('FROM projects')
    expect(DECIDED_STAGES).toEqual(expect.arrayContaining(['won', 'lost']))
    expect(diagnoseFor).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(report).toEqual({ examined: 1, reevaluated: 1 })
  })

  it('#3294 — sans événement, ou lecture des événements en échec, un espace récent n’est PAS rejoué', async () => {
    workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID }])
    diagnoses.find.mockResolvedValue([{ computed_at: new Date('2026-09-29T06:00:00Z') }])
    diagnoses.manager.query.mockResolvedValueOnce([{ happened: false }])
    await service.sweep(new Date('2026-09-30T06:00:00Z'))
    diagnoses.manager.query.mockRejectedValueOnce(new Error('base indisponible'))
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    await service.sweep(new Date('2026-09-30T06:00:00Z'))
    expect(diagnoseFor).not.toHaveBeenCalled()
  })

  it('passe chaque espace au crible séparément — un espace à jour n’empêche pas de rejouer les autres', async () => {
    workspaces.find.mockResolvedValue([{ id: 'due' }, { id: 'not-due' }])
    diagnoses.find.mockImplementation((opts: { where: { workspace_id: string } }) =>
      Promise.resolve(opts.where.workspace_id === 'due' ? [] : [{ computed_at: new Date('2026-09-29T06:00:00Z') }]),
    )

    const report = await service.sweep(new Date('2026-09-30T06:00:00Z'))

    expect(diagnoseFor).toHaveBeenCalledTimes(1)
    expect(diagnoseFor).toHaveBeenCalledWith('due')
    expect(report).toEqual({ examined: 2, reevaluated: 1 })
  })
})
