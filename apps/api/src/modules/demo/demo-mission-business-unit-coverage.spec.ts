import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_BUSINESS_UNITS, DEMO_DELIVERY_CLIENT, DEMO_MISSION_BUSINESS_UNIT_TRANSFER } from './demo-dataset'
import { DEMO_MISSION_BUSINESS_UNIT_TRANSFER_COVERAGE } from './demo-coverage'

/**
 * #3413 « autre BU » — LE TRANSFERT, OBSERVABLE EN DÉMONSTRATION (craft rule n°9).
 *
 * Cette garde SAIT DIRE NON : elle relit le jeu réellement construit (la mission et
 * les deux BU doivent exister) ET le semis (la colonne ET la ligne de journal doivent
 * y être écrites) — retirer l'un ou l'autre la fait rougir.
 */
describe('couverture démo — transfert de BU d’une mission (#3413)', () => {
  const entries = Object.entries(DEMO_MISSION_BUSINESS_UNIT_TRANSFER)

  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(0)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('chaque transfert part d’une mission du client d’exemple, entre deux BU DISTINCTES du jeu', () => {
    const labels = new Set<string>(DEMO_DELIVERY_CLIENT.missions.map(mission => mission.label))
    const units = new Set<string>(DEMO_BUSINESS_UNITS.map(unit => unit.name))
    for (const [label, transfer] of entries) {
      expect(labels.has(label)).toBe(true)
      expect(units.has(transfer.fromBusinessUnit)).toBe(true)
      expect(units.has(transfer.toBusinessUnit)).toBe(true)
      expect(transfer.fromBusinessUnit).not.toBe(transfer.toBusinessUnit)
    }
  })

  it('toutes les missions ne sont PAS transférées — « BU de son compte » doit aussi se voir', () => {
    expect(entries.length).toBeLessThan(DEMO_DELIVERY_CLIENT.missions.length)
  })

  it('le semis ÉCRIT la colonne ET le journal — un jeu déclaré sans écrivain ne se verrait pas', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toMatch(/UPDATE missions SET business_unit_id/)
    expect(seed).toMatch(/INSERT INTO record_field_audit/)
    expect(seed).toContain('DEMO_MISSION_BUSINESS_UNIT_TRANSFER[')
  })

  it('est classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_MISSION_BUSINESS_UNIT_TRANSFER_COVERAGE.state).toBe('seede')
    expect(DEMO_MISSION_BUSINESS_UNIT_TRANSFER_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
