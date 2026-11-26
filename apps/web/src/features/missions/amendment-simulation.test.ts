import { MISSION_AMENDMENT_EVENT_TYPES, type MissionAmendmentEventType } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { amendmentSimulationScenarioKind } from './amendment-simulation'

/**
 * #2783 — épopée « simulation impact avenant » (#2423.6). Le simulateur de
 * marge existant (#2420.14, `simulateMissionMarginScenario`) n'était appelé
 * par AUCUN chemin de l'avenant (`mission-amendment.service.ts`/`.controller.ts` :
 * zéro appelant). Cette fonction est la SEULE décision qui choisit, pour un
 * type d'événement d'avenant donné, quel scénario du simulateur existant
 * pré-remplir dans l'écran d'avenant — TJM et dates seulement (portée de
 * l'épopée), jamais devinée pour les treize autres types.
 */
describe('amendmentSimulationScenarioKind (#2783)', () => {
  it('un changement de TJM se simule en « tarif renouvelé »', () => {
    expect(amendmentSimulationScenarioKind('daily_rate_change')).toBe('renewed_rate')
  })

  it('un changement de date de fin ou de début se simule en « prolongation »', () => {
    expect(amendmentSimulationScenarioKind('end_date_change')).toBe('extension')
    expect(amendmentSimulationScenarioKind('start_date_change')).toBe('extension')
  })

  it('sait dire NON : les treize autres types d’événement ne se simulent pas', () => {
    const other = MISSION_AMENDMENT_EVENT_TYPES.filter(
      (type): type is MissionAmendmentEventType =>
        type !== 'daily_rate_change' && type !== 'end_date_change' && type !== 'start_date_change',
    )
    expect(other).toHaveLength(13)
    for (const type of other) {
      expect(amendmentSimulationScenarioKind(type)).toBeNull()
    }
  })
})
