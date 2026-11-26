import { IntegrationSyncController } from './integration-sync.controller'
import { integrationSyncJobId } from './integration-sync.queue'

function build(overrides: { activeRun?: unknown } = {}) {
  const run = {
    id: 'run-1',
    provider: 'hubspot',
    status: 'pending' as const,
    workspace_id: 'ws-1',
    started_at: new Date('2026-09-25T10:00:00.000Z'),
    finished_at: null,
    summary: null,
    error_fr: null,
    error_en: null,
    canceled_at: null,
  }
  const syncs = {
    startRun: jest.fn().mockResolvedValue(run),
    getActiveRun: jest.fn().mockResolvedValue(overrides.activeRun ?? null),
    getRun: jest.fn().mockResolvedValue(run),
    getLatestRun: jest.fn().mockResolvedValue(run),
    cancelRun: jest.fn().mockResolvedValue(undefined),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const queue = { add: jest.fn().mockResolvedValue(undefined) }
  const controller = new IntegrationSyncController(syncs as never, workspaceContext as never, queue as never)
  return { controller, syncs, queue }
}

const user = { userId: 'user-1', email: 'a@bellum.fr' }

describe('#2207.19 — POST /tools/:provider/sync-runs répond tout de suite', () => {
  it('rend le run `pending` — le geste répond avant que le job n’ait rien fait', async () => {
    const { controller } = build()
    const result = await controller.start('hubspot', user)
    expect(result.status).toBe('pending')
  })

  it('enfile un job BullMQ avec un jobId qui porte le run (#4591)', async () => {
    const { controller, queue } = build()
    await controller.start('hubspot', user)
    expect(queue.add).toHaveBeenCalledWith(
      'sync',
      { runId: 'run-1', workspaceId: 'ws-1', userId: 'user-1', provider: 'hubspot' },
      expect.objectContaining({ jobId: integrationSyncJobId('ws-1', 'hubspot', 'run-1') }),
    )
  })
})

describe('#2110.81 — la garde anti-double-lancement', () => {
  it('refuse un second départ (409) tant qu’un run non terminal existe', async () => {
    const { controller, syncs, queue } = build({ activeRun: { id: 'run-0', status: 'reading_sources' } })
    await expect(controller.start('hubspot', user)).rejects.toThrow()
    expect(syncs.startRun).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('laisse repartir un nouveau lancement une fois le précédent terminal', async () => {
    const { controller, queue } = build({ activeRun: null })
    await controller.start('hubspot', user)
    expect(queue.add).toHaveBeenCalled()
  })
})

describe('#2110.39 — POST /tools/:provider/sync-runs/:id/cancel', () => {
  it('annule un run vivant et rend son état à jour', async () => {
    const { controller, syncs } = build()
    const result = await controller.cancel('run-1', user)
    expect(syncs.cancelRun).toHaveBeenCalledWith('ws-1', 'run-1')
    expect(result.id).toBe('run-1')
  })

  it('404 sur un run introuvable — rien à annuler', async () => {
    const { controller, syncs } = build()
    syncs.getRun.mockResolvedValueOnce(null)
    await expect(controller.cancel('unknown', user)).rejects.toThrow()
  })
})

describe('GET /tools/:provider/sync-runs/:id — le polling', () => {
  it('404 sur un run introuvable', async () => {
    const { controller, syncs } = build()
    syncs.getRun.mockResolvedValueOnce(null)
    await expect(controller.get('unknown', user)).rejects.toThrow()
  })
})

describe('GET /tools/:provider/sync-runs/latest', () => {
  it('rend le dernier run de ce connecteur', async () => {
    const { controller } = build()
    const result = await controller.getLatest('hubspot', user)
    expect(result.provider).toBe('hubspot')
  })

  it('404 quand ce connecteur n’a jamais été synchronisé', async () => {
    const { controller, syncs } = build()
    syncs.getLatestRun.mockResolvedValueOnce(null)
    await expect(controller.getLatest('notion', user)).rejects.toThrow()
  })
})

// #4591 — le sondage de l'état d'un travail ne doit pas être étranglé par la porte de débit : une route de LECTURE
// d'état a son propre compteur (la clé du throttler inclut la classe et le handler), plus large que le global (120/min).
describe('#4591 — le sondage d’un run a son propre seuil, plus large', () => {
  const GLOBAL_LIMIT = 120
  const limitOf = (handler: unknown, name = 'default-1m'): unknown =>
    Reflect.getMetadata(`THROTTLER:LIMIT${name}`, handler as object)
  const proto = IntegrationSyncController.prototype

  it.each(['get', 'getLatest'] as const)('GET %s : seuil propre, au-dessus du global', handler => {
    const limit = limitOf(proto[handler])
    expect(typeof limit).toBe('number')
    expect(limit as number).toBeGreaterThan(GLOBAL_LIMIT)
  })

  it('le geste qui ÉCRIT (démarrer, annuler) garde le seuil global : seul le sondage est élargi', () => {
    expect(limitOf(proto.start)).toBeUndefined()
    expect(limitOf(proto.cancel)).toBeUndefined()
  })
})
