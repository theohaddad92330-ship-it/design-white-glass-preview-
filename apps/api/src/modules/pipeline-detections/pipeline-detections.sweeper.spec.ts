import { PipelineDetectionsSweeper } from './pipeline-detections.sweeper'
import type { PipelineDetectionsService } from './pipeline-detections.service'

function build(workspaces: { id: string }[] = [{ id: 'ws-1' }, { id: 'ws-2' }]) {
  const query = jest.fn().mockResolvedValue(workspaces)
  const sweepWorkspace = jest.fn().mockResolvedValue({
    interest_to_opportunity: 1,
    shortlist_to_submission: 0,
    interview_to_mission: null,
  })
  const service = { sweepWorkspace } as unknown as PipelineDetectionsService
  return { sweeper: new PipelineDetectionsSweeper({ query } as never, service), sweepWorkspace, query }
}

describe('PipelineDetectionsSweeper (#4016 L6)', () => {
  afterEach(() => {
    delete process.env.PIPELINE_AUTO_DETECT_DISABLED
  })

  it('balaie chaque espace RÉEL et compte les lignes écrites (un passage non mesuré ne compte pas 0)', async () => {
    const { sweeper, sweepWorkspace, query } = build()
    await expect(sweeper.sweep()).resolves.toBe(2)
    expect(sweepWorkspace).toHaveBeenCalledTimes(2)
    // Jamais d'écriture dans un espace de démonstration : la démo est SEMÉE.
    expect(query.mock.calls[0]?.[0]).toContain('is_demo = false')
  })

  it('l’interrupteur coupe tout — aucune lecture, aucune écriture', async () => {
    process.env.PIPELINE_AUTO_DETECT_DISABLED = 'true'
    const { sweeper, sweepWorkspace, query } = build()
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(query).not.toHaveBeenCalled()
    expect(sweepWorkspace).not.toHaveBeenCalled()
  })

  it('un espace en échec n’emporte pas les autres', async () => {
    const { sweeper, sweepWorkspace } = build()
    sweepWorkspace.mockRejectedValueOnce(new Error('boom'))
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(sweepWorkspace).toHaveBeenCalledTimes(2)
  })
})
