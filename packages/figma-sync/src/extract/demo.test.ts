import { describe, expect, it } from 'vitest'

import demoJson from '../../generated/demo.json'
import { DemoSetSchema, extractDemo, loadDemoModule } from './demo'

describe('generated/demo.json — le jeu de démonstration des maquettes (défaut B)', () => {
  it('est à jour du jeu de l’API (relancer `extract` sinon)', async () => {
    const fresh = extractDemo(await loadDemoModule())
    expect(DemoSetSchema.parse(demoJson)).toEqual(fresh)
  }, 120_000)

  it('porte de vraies fiches : les six comptes vitrine de la salle avec les axes de leur score, aucune probabilité', () => {
    const demo = DemoSetSchema.parse(demoJson)
    expect(demo.accounts.map(a => a.name)).toContain('ENGIE')
    expect(demo.accounts.length).toBe(6)
    for (const a of demo.accounts) expect(a.axes.length).toBeGreaterThan(0)
    expect(demo.contacts.length).toBeGreaterThan(6)
    expect(demo.consultants.length).toBeGreaterThan(3)
    expect(JSON.stringify(demo)).not.toMatch(/probabilit|chance de/i)
  })
})
