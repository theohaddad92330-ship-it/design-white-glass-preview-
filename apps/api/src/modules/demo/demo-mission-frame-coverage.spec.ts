import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT, DEMO_MISSION_FRAME } from './demo-dataset'
import { DEMO_MISSION_FRAME_COVERAGE } from './demo-coverage'

/**
 * Refonte Théo MISSIONS-A (23/10) — L'OBJECTIF ET LE PÉRIMÈTRE d'une mission, OBSERVABLES EN DÉMONSTRATION
 * (craft rule n°9). La carte d'identité du dossier les écrit sous les dates ; sans semis, le dossier de
 * démonstration s'ouvrirait sans eux (`missions.objective` / `missions.perimeter`, colonnes d'une table déjà
 * seedée : la garde de tables y est aveugle).
 *
 * Elle SAIT DIRE NON : la mission désignée doit exister sur le client d'exemple, et le semis doit écrire les
 * deux colonnes.
 */
describe('couverture démo — objectif et périmètre de mission (refonte Théo)', () => {
  const entries = Object.entries(DEMO_MISSION_FRAME)

  it('lit un corpus NON VIDE', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('chaque mission désignée existe sur le client d’exemple, objectif et périmètre écrits', () => {
    const labels = new Set<string>(DEMO_DELIVERY_CLIENT.missions.map(mission => mission.label))
    for (const [label, frame] of entries) {
      expect(labels.has(label)).toBe(true)
      expect(frame.objective.length).toBeGreaterThan(10)
      expect(frame.perimeter.length).toBeGreaterThan(10)
    }
  })

  it('toutes les missions ne sont PAS cadrées — l’absence (aucune ligne) doit aussi se voir', () => {
    expect(entries.length).toBeLessThan(DEMO_DELIVERY_CLIENT.missions.length)
  })

  it('le semis ÉCRIT les deux colonnes', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toMatch(/UPDATE missions SET objective = \$1, perimeter = \$2/)
    expect(seed).toContain('DEMO_MISSION_FRAME[')
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_MISSION_FRAME_COVERAGE.state).toBe('seede')
    expect(DEMO_MISSION_FRAME_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
