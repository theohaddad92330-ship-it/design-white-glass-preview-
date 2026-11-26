import { describe, expect, it } from 'vitest'
import { MANAGER_KPI_OWNERS } from './manager-kpi.js'
import { PILOTAGE_LEVELS } from './pilotage.js'
import {
  PILOTAGE_ALERTABLE_METRIC_KEYS,
  PILOTAGE_METRIC_GUIDANCE,
  pilotageChainGuidance,
} from './pilotage-chain-guidance.js'

describe('PILOTAGE_METRIC_GUIDANCE — #3415.2 (lot C14 30/09)', () => {
  it('porte une entrée pour chacun des sept indicateurs qui peuvent décrocher', () => {
    for (const key of PILOTAGE_ALERTABLE_METRIC_KEYS) {
      expect(PILOTAGE_METRIC_GUIDANCE[key]).toBeDefined()
    }
    expect(Object.keys(PILOTAGE_METRIC_GUIDANCE)).toHaveLength(PILOTAGE_ALERTABLE_METRIC_KEYS.length)
  })

  it.each(PILOTAGE_ALERTABLE_METRIC_KEYS)('%s porte un seuil, une cause et une décision non vides', key => {
    const guidance = PILOTAGE_METRIC_GUIDANCE[key]
    expect(guidance.threshold.length).toBeGreaterThan(0)
    expect(guidance.cause.length).toBeGreaterThan(0)
    expect(guidance.decision.length).toBeGreaterThan(0)
  })

  it.each(PILOTAGE_ALERTABLE_METRIC_KEYS)('%s nomme un responsable et un maillon réels', key => {
    const guidance = PILOTAGE_METRIC_GUIDANCE[key]
    expect(MANAGER_KPI_OWNERS).toContain(guidance.owner)
    expect(PILOTAGE_LEVELS).toContain(guidance.level)
  })
})

describe('pilotageChainGuidance — #3415.2', () => {
  it('rend la fiche pour un indicateur qui peut décrocher', () => {
    expect(pilotageChainGuidance('replyRate')?.owner).toBe('business')
  })

  it.each(['contactsTargeted', 'benchAvailable', 'activeClients', 'correctionRate', 'tjm', 'unknownKey'])(
    '%s ne peut pas décrocher structurellement — rend null plutôt qu’une décision inventée',
    key => {
      expect(pilotageChainGuidance(key)).toBeNull()
    },
  )
})
