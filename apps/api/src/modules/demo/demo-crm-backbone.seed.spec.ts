import type { EntityManager } from 'typeorm'
import { DEMO_CRM_BACKBONE, seedDemoCrmBackbone } from './demo-crm-backbone'

/**
 * #4191 R22 (G4) — le semis est RÉELLEMENT exécuté (la garde voisine ne lisait que les constantes) : la mission née
 * de la signature du positionnement de Yanis Berthier existe, avec son TJM et le coût (450 €) du positionnement.
 */
function fakeManager() {
  const calls: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (sql.includes('FROM accounts')) return Promise.resolve([{ id: 'acc-sg' }])
      if (sql.includes('FROM opportunities')) return Promise.resolve([{ id: 'opp-1' }])
      if (sql.includes('FROM project_needs')) return Promise.resolve([{ id: 'need-1' }])
      if (sql.includes('FROM consultants')) return Promise.resolve([{ id: `c-${String(params[1])}` }])
      if (sql.includes('FROM submissions s JOIN consultants')) {
        return Promise.resolve([{ id: 'sub-yanis', consultant_id: 'c-Yanis Berthier' }])
      }
      if (sql.includes('FROM missions WHERE submission_id')) return Promise.resolve([])
      if (sql.includes('INSERT INTO missions')) return Promise.resolve([{ id: 'mission-1' }])
      return Promise.resolve([])
    },
  }
  return { manager: manager as unknown as EntityManager, calls }
}

describe('seedDemoCrmBackbone — la mission signée est semée avec le coût du positionnement', () => {
  it('insère la mission de Yanis Berthier (TJM 650) ET son coût chargé 450 € (jamais 0)', async () => {
    const { manager, calls } = fakeManager()
    await seedDemoCrmBackbone(manager, 'ws', 'owner')
    const mission = calls.find(call => call.sql.includes('INSERT INTO missions'))
    expect(mission?.params).toContain(DEMO_CRM_BACKBONE.signedMission.daily_rate)
    const terms = calls.find(call => call.sql.includes('INSERT INTO mission_commercial_terms'))
    expect(terms?.params).toEqual(['mission-1', 'ws', 450_00])
  })

  it('affecte Yanis Berthier à la mission signée : sans affectation, /missions ne le nomme pas', async () => {
    const { manager, calls } = fakeManager()
    await seedDemoCrmBackbone(manager, 'ws', 'owner')
    const assignment = calls.find(call => call.sql.includes('INSERT INTO mission_assignments'))
    expect(assignment?.params.slice(0, 3)).toEqual(['mission-1', 'ws', 'c-Yanis Berthier'])
  })
})
