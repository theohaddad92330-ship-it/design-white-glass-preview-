import { createMockRepository } from '../../database/test-utils'
import type { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import type { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import { ConnectorProbeService } from './connector-probe.service'

function service(
  probes: ReturnType<typeof createMockRepository<ConnectorCapabilityProbeEntity>>,
  incidents: ReturnType<
    typeof createMockRepository<ConnectorCapabilityIncidentEntity>
  > = createMockRepository<ConnectorCapabilityIncidentEntity>(),
) {
  return new ConnectorProbeService(probes as never, incidents as never)
}

const INPUT = { workspaceId: 'ws-1', userId: 'u-1', provider: 'gmail', capability: 'read' }

// #2445.12 (épopée #2766) — `connector_capability_probes` écrase sa dernière
// observation à chaque appel : rien n'y garde le MOMENT où une capacité s'est
// mise à échouer, ni celui où elle s'est rétablie. Ce service journalise
// désormais la TRANSITION, en plus d'écrire le probe — jamais une seconde
// source devinée après coup, seulement ce qu'il vient d'observer lui-même.
describe('ConnectorProbeService — journal des transitions (#2445.12)', () => {
  it('la toute PREMIÈRE observation ne journalise aucune transition — il n’y a pas de « avant »', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockResolvedValue(null)
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: true })

    expect(incidents.save).not.toHaveBeenCalled()
  })

  it('ok → ok (déjà sain, reste sain) : aucune transition', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockResolvedValue({ last_error_code: null })
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: true })

    expect(incidents.save).not.toHaveBeenCalled()
  })

  it('ok → erreur : journalise une transition `degraded`', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockResolvedValue({ last_error_code: null })
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: false, errorCode: 'provider_unavailable' })

    expect(incidents.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        provider: 'gmail',
        capability: 'read',
        transition: 'degraded',
        error_code: 'provider_unavailable',
      }),
    )
  })

  it('erreur → ok : journalise une transition `recovered`, sans code d’erreur', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockResolvedValue({ last_error_code: 'provider_unavailable' })
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: true })

    expect(incidents.save).toHaveBeenCalledWith(expect.objectContaining({ transition: 'recovered', error_code: null }))
  })

  it('erreur → erreur (toujours en échec) : aucune NOUVELLE transition, ce n’est pas un nouvel évènement', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockResolvedValue({ last_error_code: 'rate_limited' })
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: false, errorCode: 'rate_limited' })

    expect(incidents.save).not.toHaveBeenCalled()
  })

  it('une panne de lecture (findOne) ne bloque pas l’écriture du probe — best-effort, comme le reste du service', async () => {
    const probes = createMockRepository<ConnectorCapabilityProbeEntity>()
    probes.findOne.mockRejectedValue(new Error('db down'))
    const incidents = createMockRepository<ConnectorCapabilityIncidentEntity>()

    await service(probes, incidents).record({ ...INPUT, ok: false, errorCode: 'provider_unavailable' })

    expect(probes.createQueryBuilder).toHaveBeenCalled()
    expect(incidents.save).not.toHaveBeenCalled()
  })
})
