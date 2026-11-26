import { describe, expect, it } from 'vitest'
import { declareModelRoutingEvalInternalSchema, declareModelRoutingEvalSchema } from './model-routing-eval.js'

describe('declareModelRoutingEvalSchema — #2975 / #2440.82', () => {
  it('accepte une destination seule, sans note', () => {
    const parsed = declareModelRoutingEvalSchema.safeParse({ destinationKey: 'openai:gpt-4o' })
    expect(parsed.success).toBe(true)
  })

  it('accepte une note facultative', () => {
    const parsed = declareModelRoutingEvalSchema.safeParse({
      destinationKey: 'openai',
      note: 'rejoué le 08/10',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une destination vide — jamais une déclaration à moitié renseignée', () => {
    const parsed = declareModelRoutingEvalSchema.safeParse({ destinationKey: '   ' })
    expect(parsed.success).toBe(false)
  })

  it('refuse un corps sans destinationKey', () => {
    const parsed = declareModelRoutingEvalSchema.safeParse({ note: 'sans cible' })
    expect(parsed.success).toBe(false)
  })

  it('ne porte jamais declaredBy — il vient de la session, jamais d’un champ écrit par le client', () => {
    const parsed = declareModelRoutingEvalSchema.safeParse({
      destinationKey: 'openai',
      declaredBy: 'quelqu-un-d-autre@example.com',
    })
    expect(parsed.success).toBe(true)
    // la clé surnuméraire est simplement ignorée par zod (pas de .strict()) —
    // ce test fige l'intention : ce schéma ne DOIT jamais déclarer `declaredBy`.
    expect('declaredBy' in declareModelRoutingEvalSchema.shape).toBe(false)
  })
})

describe('declareModelRoutingEvalInternalSchema — #2975 / #2440.82', () => {
  it('exige declaredBy, contrairement au schéma navigateur', () => {
    const sansAuteur = declareModelRoutingEvalInternalSchema.safeParse({ destinationKey: 'openai' })
    expect(sansAuteur.success).toBe(false)

    const avecAuteur = declareModelRoutingEvalInternalSchema.safeParse({
      destinationKey: 'openai',
      declaredBy: 'matteo@bellum-it.com',
    })
    expect(avecAuteur.success).toBe(true)
  })

  it('refuse un auteur vide', () => {
    const parsed = declareModelRoutingEvalInternalSchema.safeParse({
      destinationKey: 'openai',
      declaredBy: '   ',
    })
    expect(parsed.success).toBe(false)
  })
})
