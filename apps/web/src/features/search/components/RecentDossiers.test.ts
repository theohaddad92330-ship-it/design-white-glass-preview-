import { describe, expect, it } from 'vitest'
import { DEMO_TRY_DOSSIERS, demoDossiersFirst } from './RecentDossiers'

describe('#4512 — « Ou essaie un dossier » en démo', () => {
  it('les dossiers semés passent devant, dans l’ordre Airbus / EDF / Renault / Thales', () => {
    const listed = [
      { id: '1', company_name: 'Société Générale' },
      { id: '2', company_name: 'Thales' },
      { id: '3', company_name: 'SNCF' },
      { id: '4', company_name: 'EDF' },
      { id: '5', company_name: 'Renault' },
      { id: '6', company_name: 'Airbus' },
    ]
    expect(demoDossiersFirst(listed).map(d => d.company_name)).toEqual([
      'Airbus',
      'EDF',
      'Renault',
      'Thales',
      'Société Générale',
      'SNCF',
    ])
    expect(DEMO_TRY_DOSSIERS).toEqual(['Airbus', 'EDF', 'Renault', 'Thales'])
  })

  it('sait dire NON : un nom semé ABSENT de la salle ne fait aucune pastille inventée', () => {
    const listed = [{ id: '1', company_name: 'SNCF' }]
    expect(demoDossiersFirst(listed)).toEqual(listed)
    expect(demoDossiersFirst([])).toEqual([])
  })
})
