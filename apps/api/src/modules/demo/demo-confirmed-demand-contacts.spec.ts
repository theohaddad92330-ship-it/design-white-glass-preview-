import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #3624 (R2 07/10) — « Contacter <nom> » sous « Demandes confirmées » : la recette prod du 07/10 a trouvé 0 bouton
 * sur SNCF. `project_contacts` n'était semé que sur l'affaire QUALIFIÉE du compte ; la demande CONFIRMÉE (celle que
 * l'écran liste) n'avait aucun interlocuteur rattaché, donc `NeedContactActions` ne rendait rien (à juste titre).
 */
const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

describe('démo — la demande confirmée du compte porte ses interlocuteurs (#3624)', () => {
  const confirmed = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases.filter(c => c.stage === 'confirmed')

  it('la salle porte une demande confirmée, avec au moins un interlocuteur rattaché', () => {
    expect(confirmed.length).toBeGreaterThan(0)
    for (const demand of confirmed) {
      expect((demand.contacts ?? []).length).toBeGreaterThan(0)
    }
  })

  it('chaque interlocuteur est un contact DÉJÀ semé du compte, jamais un nom inventé', () => {
    const known = new Set(DEMO_DELIVERY_CLIENT.contacts.map(c => c.full_name))
    for (const demand of confirmed) {
      for (const link of demand.contacts ?? []) expect(known.has(link.full_name)).toBe(true)
    }
  })

  it('SAIT DIRE NON — une idée générique ou détectée ne porte aucun interlocuteur', () => {
    const others = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases.filter(c => c.stage !== 'confirmed')
    expect(others.length).toBeGreaterThan(0)
    for (const other of others) expect(other.contacts ?? []).toEqual([])
  })

  it('le semis écrit ces liens dans project_contacts', () => {
    const loop = seed.slice(seed.indexOf('for (const cas of client.signalsAndNeedsCases)'))
    expect(loop.slice(0, 2500)).toMatch(/INSERT INTO project_contacts/)
  })
})
