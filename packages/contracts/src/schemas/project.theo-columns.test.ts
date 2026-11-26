import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGE_LABELS,
  PIPELINE_STAGES,
  PROJECT_STAGES,
  THEO_COLUMN_OF_STAGE,
  THEO_EXIT_STAGES,
} from './project.js'

// Théo C projects-pipeline.R2 — les cinq colonnes de Théo, Perdue / En sommeil en sorties.
describe('Théo C projects-pipeline.R2 — correspondance 9 étapes stockées → 5 colonnes + 2 sorties', () => {
  it('chaque étape stockée a UNE réponse écrite : rien n’est perdu', () => {
    for (const stage of PROJECT_STAGES) expect(THEO_COLUMN_OF_STAGE).toHaveProperty(stage)
  })

  it('les colonnes de Théo se lisent dans l’ordre : À qualifier · Cadrage · Profils présentés · Proposition · Gagnée', () => {
    expect(PIPELINE_STAGES.map(stage => DEFAULT_STAGE_LABELS[stage].fr)).toEqual([
      'À qualifier',
      'Cadrage',
      'Profils présentés',
      'Proposition',
      'Gagnée',
    ])
  })

  it('Perdue et En sommeil sont des sorties, jamais des colonnes', () => {
    expect([...THEO_EXIT_STAGES]).toEqual(['lost', 'dormant'])
    expect(THEO_COLUMN_OF_STAGE.lost).toBe('exit')
    expect(THEO_COLUMN_OF_STAGE.dormant).toBe('exit')
  })

  it('les étapes d’entrée (détecté, potentiel) restent des pistes, hors colonnes', () => {
    expect(THEO_COLUMN_OF_STAGE.detected).toBe('intake')
    expect(THEO_COLUMN_OF_STAGE.potential).toBe('intake')
  })

  it('une étape de colonne se projette sur elle-même (les valeurs stockées ne bougent pas)', () => {
    for (const stage of PIPELINE_STAGES) expect(THEO_COLUMN_OF_STAGE[stage]).toBe(stage)
  })
})
