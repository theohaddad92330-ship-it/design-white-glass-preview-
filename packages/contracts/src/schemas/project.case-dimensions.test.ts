import { describe, expect, it } from 'vitest'
import { updateProjectCaseDimensionsSchema } from './project.js'

// #3246 — saisir stratégie / modèle d'achat / organisation sur une affaire DÉJÀ clôturée.
describe('updateProjectCaseDimensionsSchema', () => {
  it('accepte un choix du vocabulaire fermé', () => {
    const r = updateProjectCaseDimensionsSchema.safeParse({ strategy: 'via_partenaire', buying_model: 'appel_offres' })
    expect(r.success).toBe(true)
  })

  it('accepte l’organisation seule', () => {
    expect(updateProjectCaseDimensionsSchema.safeParse({ organisation: 'comite_elargi' }).success).toBe(true)
  })

  it('refuse une organisation hors vocabulaire', () => {
    expect(updateProjectCaseDimensionsSchema.safeParse({ organisation: 'tout_le_monde' }).success).toBe(false)
  })

  it('refuse une valeur hors vocabulaire — jamais une chaîne libre', () => {
    expect(updateProjectCaseDimensionsSchema.safeParse({ strategy: 'au_feeling' }).success).toBe(false)
  })

  it('refuse un corps vide : un PATCH qui ne dit rien ne touche à rien', () => {
    expect(updateProjectCaseDimensionsSchema.safeParse({}).success).toBe(false)
  })

  it('null EFFACE explicitement (une correction humaine gagne)', () => {
    const r = updateProjectCaseDimensionsSchema.safeParse({ strategy: null })
    expect(r.success).toBe(true)
  })

  it('refuse une clé en plus', () => {
    expect(updateProjectCaseDimensionsSchema.safeParse({ strategy: null, stage: 'won' }).success).toBe(false)
  })
})
