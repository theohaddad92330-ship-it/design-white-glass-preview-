import type { ProjectStage } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { FRIEZE_STEPS, friezeFor, stageOfFriezeStep } from './project-frieze'

describe('projects-fiche.R2/N3 — la frise de cinq étapes, sur les neuf états inchangés', () => {
  const cases: [ProjectStage, number | null][] = [
    ['detected', 0],
    ['potential', 0],
    ['confirmed', 0],
    ['qualified', 1],
    ['profiles_submitted', 2],
    ['negotiation', 3],
    ['won', 4],
    ['lost', null],
    ['dormant', null],
  ]

  it.each(cases)('%s → étape %s', (stage, index) => {
    expect(friezeFor(stage).activeIndex).toBe(index)
  })

  it('une sortie (perdue, en sommeil) ne fait avancer aucune étape et se nomme', () => {
    expect(friezeFor('lost').exit).toBe('lost')
    expect(friezeFor('dormant').exit).toBe('dormant')
    expect(friezeFor('qualified').exit).toBeNull()
  })

  it('numérote les étapes de rang 3 à 5 (compteurs d’avancement de Théo) et marque le fait', () => {
    const steps = friezeFor('profiles_submitted').steps
    expect(steps.map(s => s.rank)).toEqual([1, 2, 3, 4, 5])
    expect(steps.map(s => s.status)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
  })

  it('chaque étape de la frise vise un état réel du pipe — rien d’inventé', () => {
    expect(FRIEZE_STEPS.map(stageOfFriezeStep)).toEqual([
      'confirmed',
      'qualified',
      'profiles_submitted',
      'negotiation',
      'won',
    ])
  })
})
