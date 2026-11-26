import { describe, expect, it } from 'vitest'
import { TEMPS1_STAGES, type Question } from './index'

/**
 * #2024.9 — une explication courte sous chaque question d'une SÉLECTION
 * LONGUE (`multi` / `multi-grouped`) : celles-ci demandent le plus d'effort
 * de lecture avant de choisir, donc c'est là que « pourquoi ce champ, et
 * comment je m'en sers » manque le plus. Le lot L6 en avait posé 5 sur 10 —
 * cette garde ferme les deux dernières sélections longues qui en manquaient
 * (`target_company_types`, `geo_zones`).
 */
const ALL_QUESTIONS: Question[] = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions))
const LONG_SELECTIONS = ALL_QUESTIONS.filter(q => q.kind === 'multi' || q.kind === 'multi-grouped')

describe('sélections longues (multi / multi-grouped) → un sous-titre par question', () => {
  it('le corpus de la garde n’est pas vide', () => {
    expect(LONG_SELECTIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('chaque sélection longue porte un `subtitle` non vide', () => {
    const sansSousTitre = LONG_SELECTIONS.filter(q => !q.subtitle?.trim()).map(q => q.key)
    expect(sansSousTitre, `sélections longues sans sous-titre : ${sansSousTitre.join(', ')}`).toEqual([])
  })
})
