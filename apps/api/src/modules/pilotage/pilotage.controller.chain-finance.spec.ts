import { PilotageController } from './pilotage.controller'

/** Recette 14/10 — la chaîne lit marge et DSO dans Finance, sous `finance:read` seulement. */
function build(role: string, extra: string[], revenue?: { aggregate: jest.Mock; dso: jest.Mock }) {
  const pilotage = { getChain: jest.fn().mockResolvedValue({ levels: [] }) }
  const stockSnapshots = { baselineFor: jest.fn().mockResolvedValue(null) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role }),
    extraPermissionsOf: jest.fn().mockResolvedValue(extra),
  }
  const instance = new PilotageController(
    pilotage as never,
    {} as never,
    {} as never,
    stockSnapshots as never,
    {} as never,
    workspaceContext as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    revenue as never,
  )
  return { instance, pilotage }
}

describe('PilotageController — chain() branche marge et DSO sur Finance', () => {
  it('avec finance:read, passe les mesures de Finance à la chaîne', async () => {
    const revenue = {
      aggregate: jest.fn().mockResolvedValue({ marginPercent: 18.5 }),
      dso: jest.fn().mockResolvedValue({ days: 37 }),
    }
    const { instance, pilotage } = build('owner', [], revenue)
    await instance.chain({ userId: 'u1' } as never)
    expect(pilotage.getChain).toHaveBeenCalledWith('u1', 'ws-1', { marginPercent: 18.5, dsoDays: 37 })
    expect(revenue.aggregate).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, expect.any(String))
  })

  it('sait dire NON : sans finance:read, Finance n’est même pas lue', async () => {
    const revenue = { aggregate: jest.fn(), dso: jest.fn() }
    const { instance, pilotage } = build('member', [], revenue)
    await instance.chain({ userId: 'u1' } as never)
    expect(pilotage.getChain).toHaveBeenCalledWith('u1', 'ws-1', undefined)
    expect(revenue.aggregate).not.toHaveBeenCalled()
    expect(revenue.dso).not.toHaveBeenCalled()
  })

  it('une mesure absente ou en échec reste null, jamais 0', async () => {
    const revenue = {
      aggregate: jest.fn().mockResolvedValue({ marginPercent: null }),
      dso: jest.fn().mockRejectedValue(new Error('boom')),
    }
    const { instance, pilotage } = build('owner', [], revenue)
    await instance.chain({ userId: 'u1' } as never)
    expect(pilotage.getChain).toHaveBeenCalledWith('u1', 'ws-1', { marginPercent: null, dsoDays: null })
  })
})
