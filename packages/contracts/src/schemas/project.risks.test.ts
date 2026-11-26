import { describe, expect, it } from 'vitest'
import { projectRowSchema, updateProjectRisksSchema } from './project.js'

/**
 * #2324.37 — LE RISQUE D'UNE OPPORTUNITÉ. Une colonne texte, nullable : `null`
 * = personne ne l'a écrit (aucune ligne à l'écran), jamais une chaîne vide
 * qui passerait pour « aucun risque ».
 */
describe('updateProjectRisksSchema (#2324.37)', () => {
  it('accepte un risque écrit, rogné', () => {
    expect(updateProjectRisksSchema.parse({ risks: '  Budget 2027 non voté ' })).toEqual({
      risks: 'Budget 2027 non voté',
    })
  })

  it('null efface ; une chaîne vide devient null — jamais un risque « vide » stocké', () => {
    expect(updateProjectRisksSchema.parse({ risks: null })).toEqual({ risks: null })
    expect(updateProjectRisksSchema.parse({ risks: '   ' })).toEqual({ risks: null })
  })

  it('borne la longueur et refuse un champ inconnu', () => {
    expect(updateProjectRisksSchema.safeParse({ risks: 'x'.repeat(2001) }).success).toBe(false)
    expect(updateProjectRisksSchema.safeParse({ risks: 'ok', stage: 'won' }).success).toBe(false)
  })

  it('la ligne de projet porte le risque, absent ou null', () => {
    const shape = projectRowSchema.shape.risks
    expect(shape.safeParse(undefined).success).toBe(true)
    expect(shape.safeParse(null).success).toBe(true)
    expect(shape.safeParse('Concurrent en place').success).toBe(true)
  })
})
