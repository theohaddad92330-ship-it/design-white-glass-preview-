import type { Repository } from 'typeorm'
import type { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import type { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import type { DependencyProbeService } from './dependency-probe.service'
import { DEPENDENCIES, DEPENDENCY_IDS } from './dependency-registry'
import { OperatorHealthService } from './operator-health.service'

const NOW = new Date('2026-09-07T12:00:00.000Z')

function service(options: {
  history?: Awaited<ReturnType<DependencyProbeService['history']>>
  rows?: Partial<ConnectorCapabilityProbeEntity>[]
  rowsThrow?: boolean
  // #2445.12 (LOT écrivain 28/09, passe 2) — APPENDÉ EN FIN, même convention
  // que `rows`/`rowsThrow` ci-dessus.
  incidentRows?: Partial<ConnectorCapabilityIncidentEntity>[]
  incidentRowsThrow?: boolean
}): OperatorHealthService {
  const probes = { history: async () => options.history ?? {} } as unknown as DependencyProbeService
  const repo = {
    find: async () => {
      if (options.rowsThrow) throw new Error('base injoignable')
      return options.rows ?? []
    },
  } as unknown as Repository<ConnectorCapabilityProbeEntity>
  const incidents = {
    find: async () => {
      if (options.incidentRowsThrow) throw new Error('base injoignable')
      return options.incidentRows ?? []
    },
  } as unknown as Repository<ConnectorCapabilityIncidentEntity>
  return new OperatorHealthService(probes, repo, incidents)
}

describe('OperatorHealthService — la grille des onze', () => {
  it('rend les ONZE dépendances, dans l’ordre du registre', async () => {
    const rapport = await service({}).report(NOW)
    expect(rapport.dependencies.map(dep => dep.id)).toEqual([...DEPENDENCY_IDS])
    expect(rapport.dependencies).toHaveLength(11)
  })

  it('les dépendances mesurées à l’USAGE portent le nom de leur source, pas un état inventé', async () => {
    const rapport = await service({}).report(NOW)
    for (const lecture of rapport.dependencies) {
      if (lecture.measuredBy !== 'usage') continue
      // ⚠️ Pas de `health` : cette tuile ne se remplit qu'avec le rapport des
      // sources, que l'écran lit par ailleurs. Fabriquer un `unknown` ici la
      // ferait afficher « inconnu » alors qu'on SAIT — juste ailleurs.
      expect(lecture).not.toHaveProperty('health')
      expect(lecture.usageSource).toBe(DEPENDENCIES[lecture.id].usageSource)
    }
    expect(rapport.dependencies.filter(dep => dep.measuredBy === 'usage').length).toBeGreaterThan(3)
  })

  it('sans historique, une dépendance sondée est « inconnue » ou « éteinte » — jamais « up »', async () => {
    const rapport = await service({}).report(NOW)
    for (const lecture of rapport.dependencies) {
      if (lecture.measuredBy !== 'probe') continue
      expect(['unknown', 'off']).toContain(lecture.health.state)
    }
  })

  it('avec un historique frais, la tuile passe « up » — la lecture n’est pas morte', async () => {
    // Contrôle positif : sans lui, le test précédent serait vert même si
    // l'historique n'était jamais lu.
    const rapport = await service({
      history: { postgres: [{ at: NOW.getTime() - 60_000, ok: true, latencyMs: 12 }] },
    }).report(NOW)
    const postgres = rapport.dependencies.find(dep => dep.id === 'postgres')
    expect(postgres?.measuredBy === 'probe' && postgres.health.state).toBe('up')
    expect(postgres?.measuredBy === 'probe' && postgres.health.medianLatency24h).toEqual({
      kind: 'measured',
      ms: 12,
      samples: 1,
    })
  })

  it('AUCUNE valeur d’environnement ne sort — la présence, jamais la valeur', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_secret_valeur_a_ne_jamais_rendre'
    try {
      const serialise = JSON.stringify(await service({}).report(NOW))
      expect(serialise).not.toContain('sk_live_secret_valeur_a_ne_jamais_rendre')
      // Et pas non plus le NOM de la variable : le back-office nomme une
      // capacité, jamais un réglage (même règle que GA-85).
      expect(serialise).not.toContain('STRIPE_SECRET_KEY')
      // Ce qui sort, c'est un booléen.
      expect(serialise).toContain('"configured"')
    } finally {
      delete process.env.STRIPE_SECRET_KEY
    }
  })

  it('une base injoignable rend un état « unavailable » distinct d’un rapport vide — le reste de l’écran survit', async () => {
    // Supervision 30/09 : un rapport VIDE se lirait « aucune erreur ».
    const rapport = await service({ rowsThrow: true }).report(NOW)
    expect(rapport.clientFacingErrors).toEqual({ status: 'unavailable', windowDays: 7 })
    expect(rapport.clientFacingErrors).not.toHaveProperty('errors')
    expect(rapport.dependencies).toHaveLength(11)
  })

  it('les erreurs de CAPACITÉ sont écartées du tableau et comptées à part', async () => {
    const rapport = await service({
      rows: [
        {
          workspace_id: 'ws-1',
          capability: 'search',
          last_error_code: 'scope_missing',
          last_error_at: new Date(NOW.getTime() - 3_600_000),
        },
        {
          workspace_id: 'ws-2',
          capability: 'read',
          last_error_code: 'provider_unavailable',
          last_error_at: new Date(NOW.getTime() - 3_600_000),
        },
      ],
    }).report(NOW)

    if ('status' in rapport.clientFacingErrors) throw new Error('lecture indisponible')
    expect(rapport.clientFacingErrors.errors.map(erreur => erreur.capability)).toEqual(['read'])
    expect(rapport.clientFacingErrors.capacityErrorsExcluded).toBe(1)
  })

  // #2445.12 (LOT écrivain 28/09, passe 2) — la chronologie des TRANSITIONS,
  // absente de `connector_capability_probes` (elle n'écrit que la dernière
  // observation). LE TEST DE L'APPELANT : sans lui, un journal jamais lu par
  // `report()` resterait vert.
  describe('chronologie d’incidents (#2445.12)', () => {
    it('rend les transitions, la plus récente d’abord, sans jamais nommer le fournisseur', async () => {
      const rapport = await service({
        incidentRows: [
          {
            capability: 'read',
            transition: 'degraded',
            error_code: 'provider_unavailable',
            occurred_at: new Date(NOW.getTime() - 3_600_000),
          },
          { capability: 'read', transition: 'recovered', error_code: null, occurred_at: new Date(NOW.getTime()) },
        ],
      }).report(NOW)

      expect(rapport.incidentTimeline.entries.map(entry => entry.transition)).toEqual(['recovered', 'degraded'])
      expect(rapport.incidentTimeline.entries.every(entry => !('provider' in entry))).toBe(true)
    })

    // #2445.12 (lot SRC5 28/09 soir) — l'identifiant de la transition,
    // pour que la console puisse ADRESSER cet incident précis (impact,
    // actions, communication — ConnectorIncidentOpsService).
    it('porte l’identifiant de chaque transition — sans lui, l’écran ne peut adresser aucun incident', async () => {
      const rapport = await service({
        incidentRows: [
          {
            id: 'incident-1',
            capability: 'read',
            transition: 'degraded',
            error_code: 'provider_unavailable',
            occurred_at: new Date(NOW.getTime()),
          },
        ],
      }).report(NOW)

      expect(rapport.incidentTimeline.entries).toEqual([expect.objectContaining({ id: 'incident-1' })])
    })

    // #2445.12 — la vue de TRIAGE : les incidents actuellement OUVERTS = par
    // capacité, la dernière transition connue, seulement si « degraded ».
    it('liste les incidents OUVERTS : dernière transition par capacité, degraded seulement', async () => {
      const rapport = await service({
        incidentRows: [
          {
            id: 'a2',
            capability: 'read',
            transition: 'recovered',
            error_code: null,
            occurred_at: new Date(NOW.getTime()),
          },
          {
            id: 'b1',
            capability: 'write',
            transition: 'degraded',
            error_code: 'timeout',
            occurred_at: new Date(NOW.getTime() - 60_000),
          },
          {
            id: 'a1',
            capability: 'read',
            transition: 'degraded',
            error_code: 'timeout',
            occurred_at: new Date(NOW.getTime() - 3_600_000),
          },
        ],
      }).report(NOW)

      expect(rapport.incidentTimeline.open.map(entry => entry.id)).toEqual(['b1'])
    })

    it('sans incident ouvert, la liste est vide — aucune ligne « 0 incident »', async () => {
      const rapport = await service({}).report(NOW)
      expect(rapport.incidentTimeline.open).toEqual([])
    })

    it('une base injoignable rend une chronologie VIDE — le reste de l’écran survit', async () => {
      const rapport = await service({ incidentRowsThrow: true }).report(NOW)
      expect(rapport.incidentTimeline.entries).toEqual([])
      expect(rapport.dependencies).toHaveLength(11)
    })

    it('sans transition, une chronologie vide — jamais un « aucun incident » qu’on n’a pas vérifié', async () => {
      const rapport = await service({}).report(NOW)
      expect(rapport.incidentTimeline.entries).toEqual([])
    })
  })
})
