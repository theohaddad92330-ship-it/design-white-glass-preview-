import { describe, expect, it } from 'vitest'
import { relationshipMemorySchema } from './account.js'
import {
  CASE_RELATION_LABELS,
  CASE_TIMINGS,
  CASE_TIMING_LABELS,
  MIN_CLOSED_CYCLES_FOR_TIMING,
} from './case-dimensions.js'
import { relationshipStateSchema } from './sales-context.js'

// #3246.relation — la relation se SAISIT dans la liste fermée des 10 stades, jamais parsée du texte libre.
describe('relationshipMemorySchema.relationStage', () => {
  it('accepte un stade de la liste fermée, à côté du texte libre', () => {
    const r = relationshipMemorySchema.safeParse({ relation: 'Référencés depuis 2023', relationStage: 'ancien_client' })
    expect(r.success).toBe(true)
  })

  it('refuse un stade hors liste — jamais une chaîne libre', () => {
    expect(relationshipMemorySchema.safeParse({ relationStage: 'plutôt bonne' }).success).toBe(false)
  })

  it('null efface (une correction humaine gagne)', () => {
    expect(relationshipMemorySchema.safeParse({ relationStage: null }).success).toBe(true)
  })

  it('chaque stade porte un libellé pour la phrase de Laura', () => {
    expect(Object.keys(CASE_RELATION_LABELS).sort()).toEqual([...relationshipStateSchema.options].sort())
  })
})

// #3246.timing — liste fermée CALCULÉE, jamais saisie.
describe('CASE_TIMINGS', () => {
  it('trois positions, chacune libellée', () => {
    expect(CASE_TIMINGS).toEqual(['tot', 'dans_le_cycle', 'en_retard'])
    expect(Object.keys(CASE_TIMING_LABELS).sort()).toEqual([...CASE_TIMINGS].sort())
  })

  it('il faut au moins 3 cycles clos pour une médiane', () => {
    expect(MIN_CLOSED_CYCLES_FOR_TIMING).toBe(3)
  })
})
