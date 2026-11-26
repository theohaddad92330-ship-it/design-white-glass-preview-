import {
  formatCompletenessCatchUpReport,
  runCompletenessCatchUp,
  type CompletenessCatchUpPort,
} from './cv-completeness-catch-up.runner'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function port(count: number) {
  const enqueue = jest.fn(async (_w: string, _u: string, limit?: number) => ({
    queued: limit === undefined ? count : Math.min(count, limit),
  }))
  const service: CompletenessCatchUpPort = {
    completenessCatchUpCount: jest.fn(async () => count),
    enqueueCompletenessCatchUp: enqueue,
  }
  return { service, enqueue }
}

describe('runCompletenessCatchUp (#3883)', () => {
  it('par défaut : SIMULATION — compte, estime, et n’écrit rien', async () => {
    const { service, enqueue } = port(185)
    const report = await runCompletenessCatchUp({ service, workspaceId: WS, userId: USER, apply: false })
    expect(report).toMatchObject({ mode: 'simulation', targeted: 185, selected: 185, queued: 0, modelReads: 185 })
    expect(report.creditsEstimated).toBe(0)
    expect(enqueue).not.toHaveBeenCalled()
    expect(formatCompletenessCatchUpReport(report)).toContain('SIMULATION')
  })

  it('--appliquer met en file la sélection', async () => {
    const { service, enqueue } = port(185)
    const report = await runCompletenessCatchUp({ service, workspaceId: WS, userId: USER, apply: true })
    expect(enqueue).toHaveBeenCalledWith(WS, USER, undefined)
    expect(report).toMatchObject({ mode: 'applique', queued: 185 })
  })

  it('--limite découpe en lots reprenables', async () => {
    const { service, enqueue } = port(185)
    const report = await runCompletenessCatchUp({ service, workspaceId: WS, userId: USER, apply: true, limit: 50 })
    expect(enqueue).toHaveBeenCalledWith(WS, USER, 50)
    expect(report).toMatchObject({ targeted: 185, selected: 50, queued: 50 })
  })

  it('rien à rattraper : aucune mise en file, même avec --appliquer', async () => {
    const { service, enqueue } = port(0)
    const report = await runCompletenessCatchUp({ service, workspaceId: WS, userId: USER, apply: true })
    expect(enqueue).not.toHaveBeenCalled()
    expect(report.queued).toBe(0)
  })
})
