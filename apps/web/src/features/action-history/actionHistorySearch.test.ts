import { describe, expect, it } from 'vitest'
import { actionHistorySearchSchema } from './actionHistorySearch'

/**
 * #2200.39 / #2200.42 / #2200.43 (épopée #2867) — LE FILTRE VIT DANS L'URL.
 *
 * Un lien partagé ou trafiqué doit retomber sur « aucun filtre » plutôt que
 * de faire planter la route (même garde que `account`/`period` juste
 * au-dessus, `.catch(undefined)`).
 */
describe('actionHistorySearchSchema — risk/agent/source', () => {
  it('accepte une valeur de risque connue', () => {
    expect(actionHistorySearchSchema.parse({ risk: 'high' }).risk).toBe('high')
  })

  it('rejette silencieusement un risque inconnu (lien trafiqué)', () => {
    expect(actionHistorySearchSchema.parse({ risk: 'catastrophic' }).risk).toBeUndefined()
  })

  it('accepte human/automation pour agent, rien d’autre', () => {
    expect(actionHistorySearchSchema.parse({ agent: 'automation' }).agent).toBe('automation')
    expect(actionHistorySearchSchema.parse({ agent: 'robot' }).agent).toBeUndefined()
  })

  it('accepte un déclencheur du contrat pour source, rejette le reste', () => {
    expect(actionHistorySearchSchema.parse({ source: 'signal_detected' }).source).toBe('signal_detected')
    expect(actionHistorySearchSchema.parse({ source: 'made_up' }).source).toBeUndefined()
  })

  it('les trois restent absents sans query — aucun filtre par défaut', () => {
    const parsed = actionHistorySearchSchema.parse({})
    expect(parsed.risk).toBeUndefined()
    expect(parsed.agent).toBeUndefined()
    expect(parsed.source).toBeUndefined()
  })
})
