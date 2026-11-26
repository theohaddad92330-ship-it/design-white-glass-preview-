import { describe, expect, it } from 'vitest'
import { radarTechnologyFromFilters } from './discover-radar-entry'

/**
 * #4285.3 — l'entrée « technologie » de Découvrir PRÉ-REMPLIT le radar avec la technologie
 * déjà tapée (Compétences, puis texte libre). Seule une technologie de la liste SUIVIE
 * pré-remplit : un mot quelconque n'ouvre pas un radar « libre » à la place du commercial.
 */
describe('radarTechnologyFromFilters (#4285.3)', () => {
  it('lit la technologie suivie dans les compétences, puis dans le texte libre', () => {
    expect(radarTechnologyFromFilters({ technologiesObserved: 'S/4HANA, Java' })).toBe('SAP')
    expect(radarTechnologyFromFilters({ freetext: 'ESN Salesforce à Lyon' })).toBe('Salesforce')
    expect(radarTechnologyFromFilters({ technologiesObserved: ['ServiceNow'], freetext: 'SAP' })).toBe('ServiceNow')
  })

  it('NON : rien de suivi, rien de tapé ⇒ aucun pré-remplissage', () => {
    expect(radarTechnologyFromFilters({ freetext: 'banque mutualiste' })).toBeNull()
    expect(radarTechnologyFromFilters({})).toBeNull()
    expect(radarTechnologyFromFilters({ technologiesObserved: '', freetext: '   ' })).toBeNull()
  })
})
