import { createMockRepository } from '../../database/test-utils'
import type { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import type { ConnectorCapabilityIncidentLogEntity } from '../../database/entities/connector-capability-incident-log.entity'
import { ConnectorIncidentOpsService } from './connector-incident-ops.service'

const ANCHOR = {
  id: 'incident-1',
  workspace_id: 'ws-1',
  provider: 'gmail',
  capability: 'read',
  transition: 'degraded' as const,
  error_code: 'provider_unavailable',
  occurred_at: new Date('2026-09-28T10:00:00Z'),
}

function service(
  incidents: ReturnType<typeof createMockRepository<ConnectorCapabilityIncidentEntity>>,
  logs: ReturnType<typeof createMockRepository<ConnectorCapabilityIncidentLogEntity>> = createMockRepository(),
) {
  return { service: new ConnectorIncidentOpsService(incidents as never, logs as never), logs }
}

describe('ConnectorIncidentOpsService.impactOf — #2445.12', () => {
  it('rend `{ ok: false }` quand l’ancre n’existe pas — jamais un compte inventé', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    incidents.findOne.mockResolvedValue(null)

    const result = await service(incidents).service.impactOf('does-not-exist')

    expect(result).toEqual({ ok: false })
  })

  it('compte les espaces DISTINCTS dans la fenêtre de l’incident, jamais leur nom', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    incidents.findOne.mockResolvedValue(ANCHOR)
    incidents._qb.getOne.mockResolvedValue(null) // pas encore rétabli
    incidents._qb.getRawOne.mockResolvedValue({ count: '3' })

    const result = await service(incidents).service.impactOf('incident-1')

    expect(result).toEqual({ ok: true, workspacesTouched: 3 })
    // Jamais un identifiant d'espace dans la réponse — comptés, pas nommés.
    expect(JSON.stringify(result)).not.toContain('ws-')
  })
})

describe('ConnectorIncidentOpsService — journal append-only — #2445.12', () => {
  it('logAction refuse une incident inconnue', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    incidents.findOne.mockResolvedValue(null)

    await expect(
      service(incidents).service.logAction('does-not-exist', 'redémarré', 'louis@bellum-it.com'),
    ).rejects.toThrow()
  })

  it('logAction persiste une ACTION, sans espace ciblé', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    incidents.findOne.mockResolvedValue(ANCHOR)
    const { service: svc, logs } = service(incidents)
    logs.save.mockImplementation(async (entity: unknown) => ({
      id: 'l1',
      created_at: new Date(),
      ...(entity as object),
    }))

    const view = await svc.logAction('incident-1', 'Connecteur redémarré côté fournisseur', 'louis@bellum-it.com')

    expect(logs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: 'incident-1',
        kind: 'action',
        workspace_id: null,
        actor: 'louis@bellum-it.com',
      }),
    )
    expect(view.kind).toBe('action')
  })

  it('logCommunication persiste une COMMUNICATION, avec son espace ciblé', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    incidents.findOne.mockResolvedValue(ANCHOR)
    const { service: svc, logs } = service(incidents)
    logs.save.mockImplementation(async (entity: unknown) => ({
      id: 'l1',
      created_at: new Date(),
      ...(entity as object),
    }))

    await svc.logCommunication('incident-1', 'Client informé par e-mail', 'ws-1', 'louis@bellum-it.com')

    expect(logs.save).toHaveBeenCalledWith(
      expect.objectContaining({ incident_id: 'incident-1', kind: 'communication', workspace_id: 'ws-1' }),
    )
  })

  it('listLogs rend le journal du plus ancien au plus récent', async () => {
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()
    const logs = createMockRepository<ConnectorCapabilityIncidentLogEntity>()
    logs.find.mockResolvedValue([
      {
        id: 'l1',
        incident_id: 'incident-1',
        kind: 'action',
        workspace_id: null,
        actor: null,
        note: 'a',
        created_at: new Date(),
      },
    ])

    const rows = await service(incidents, logs).service.listLogs('incident-1')

    expect(rows).toEqual([{ id: 'l1', kind: 'action', workspaceId: null, note: 'a', createdAt: expect.any(String) }])
    expect(logs.find).toHaveBeenCalledWith({ where: { incident_id: 'incident-1' }, order: { created_at: 'ASC' } })
  })
})
