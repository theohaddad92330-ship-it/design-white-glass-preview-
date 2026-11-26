import { describe, expect, it } from 'vitest'
import { buildTiles, TILE_FAMILY_ORDER } from './connector-tiles'
import { CONNECTORS, type ConnectorView } from './connectors'

function view(id: string, state: ConnectorView['state']): ConnectorView {
  const def = CONNECTORS.find(c => c.id === id)
  if (!def) throw new Error(id)
  return { ...def, state, tools: [] }
}

const ALL = CONNECTORS.map(c => view(c.id, 'available'))

describe('Théo D settings-integrations.A1 — la grille porte TOUS nos connecteurs', () => {
  it('chaque connecteur du catalogue a au moins une tuile', () => {
    const tiles = buildTiles(ALL)
    for (const c of CONNECTORS) {
      expect(
        tiles.some(t => t.connector === c.id),
        c.id,
      ).toBe(true)
    }
  })

  it('Collective.work et Facturation sont des tuiles à part (N1, N2)', () => {
    const ids = buildTiles(ALL).map(t => t.id)
    expect(ids).toContain('collective_work')
    expect(ids).toContain('invoicing')
    expect(ids).toContain('admin_docs')
  })

  it('les cinq légendes de famille de Théo, dans l’ordre', () => {
    expect(TILE_FAMILY_ORDER).toEqual(['crm', 'workspace', 'communication', 'outreach', 'admin'])
    const families = new Set(buildTiles(ALL).map(t => t.family))
    for (const f of TILE_FAMILY_ORDER) expect(families.has(f)).toBe(true)
  })

  it('un connecteur absent du registre disparaît (rien d’inventé), pas sa famille voisine', () => {
    const tiles = buildTiles(ALL.filter(c => c.id !== 'beeper'))
    expect(tiles.some(t => t.connector === 'beeper')).toBe(false)
    expect(tiles.some(t => t.connector === 'slack')).toBe(true)
  })
})

describe('Théo D settings-integrations.R3 — l’état dicte le geste de la carte', () => {
  it('connecté → Gérer ; autorisation expirée → Réparer ; sinon → Voir le parcours', () => {
    const tiles = buildTiles([
      view('hubspot', 'connected'),
      view('zoho', 'action_required'),
      view('attio', 'available'),
    ])
    const by = (id: string) => tiles.find(t => t.id === id)
    expect(by('hubspot')?.action).toBe('manage')
    expect(by('zoho')?.action).toBe('repair')
    expect(by('attio')?.action).toBe('journey')
  })

  it('Collective.work n’est pas branchable : « à contractualiser », jamais « Connecter »', () => {
    const tile = buildTiles(ALL).find(t => t.id === 'collective_work')
    expect(tile?.status).toBe('contractual')
    expect(tile?.action).toBe('journey')
  })

  it('dans une famille, ce qui demande un geste passe devant', () => {
    const tiles = buildTiles([
      view('hubspot', 'available'),
      view('zoho', 'action_required'),
      view('attio', 'connected'),
    ])
    expect(tiles.filter(t => t.family === 'crm').map(t => t.id)).toEqual(['zoho', 'attio', 'hubspot'])
  })
})
