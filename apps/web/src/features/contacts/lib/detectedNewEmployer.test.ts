import { describe, expect, it } from 'vitest'
import { detectedNewEmployer } from './detectedNewEmployer'

// #2296.30/.33 (épopée #2964) — un contact `historique` dont Apollo connaît
// déjà l'employeur ACTUEL : on NOMME cet employeur (jamais on ne crée ni ne
// rattache le compte seul — doctrine « on propose une fusion, on ne fusionne
// jamais »). L'organisation vient d'une entrée d'historique RÉELLE, jamais
// devinée.
describe('detectedNewEmployer', () => {
  it('#2296.30 — historique + entrée employment_history current → nom nommé', () => {
    expect(
      detectedNewEmployer({
        lifecycle_state: 'historique',
        apollo_enrichment: {
          employment_history: [
            { organization_name: 'Ancien Employeur', current: false },
            { organization_name: 'Nouvel Employeur', current: true },
          ],
        },
      }),
    ).toBe('Nouvel Employeur')
  })

  it('un contact non historique ne propose jamais d’employeur détecté', () => {
    expect(
      detectedNewEmployer({
        lifecycle_state: 'actionnable',
        apollo_enrichment: { employment_history: [{ organization_name: 'X', current: true }] },
      }),
    ).toBeNull()
  })

  it('historique sans employment_history Apollo → non mesuré, jamais deviné', () => {
    expect(detectedNewEmployer({ lifecycle_state: 'historique', apollo_enrichment: null })).toBeNull()
  })

  it('historique sans entrée `current` → non mesuré', () => {
    expect(
      detectedNewEmployer({
        lifecycle_state: 'historique',
        apollo_enrichment: { employment_history: [{ organization_name: 'Ancien', current: false }] },
      }),
    ).toBeNull()
  })

  it('entrée `current` sans organization_name → non mesuré, pas de chaîne vide affichée', () => {
    expect(
      detectedNewEmployer({
        lifecycle_state: 'historique',
        apollo_enrichment: { employment_history: [{ organization_name: null, current: true }] },
      }),
    ).toBeNull()
  })
})
