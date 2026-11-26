import { describe, expect, it } from 'vitest'
import { SIMILAR_SEED_FLOOR, type SimilarAccountSuggestion } from '@bellum/contracts'
import { shouldNameSeedBase, similarSeedCount } from './similarSeedBase'

/**
 * D24 — la carte dit sur quoi elle est bâtie quand sa base est mince.
 *
 * Ce qui se teste : on ne bloque rien, on ne met rien à zéro, et on ne parle
 * QUE quand il y a quelque chose à dire.
 */
function suggestion(over: Partial<SimilarAccountSuggestion> = {}): SimilarAccountSuggestion {
  return {
    id: '123456789',
    company_name: 'ACME',
    sector: 'Édition de logiciels',
    description: 'Paris · Édition de logiciels',
    ...over,
  }
}

describe('similarSeedCount', () => {
  it('lit la base annoncée par le serveur', () => {
    expect(similarSeedCount([suggestion({ seed_count: 1 }), suggestion({ seed_count: 1 })])).toBe(1)
  })

  it('rend `null` — jamais 0 — sur une réponse qui ne porte pas le champ', () => {
    // « 0 amorce » se lirait « la carte n'est bâtie sur rien », ce qui est faux :
    // une API antérieure au champ propose exactement comme avant.
    expect(similarSeedCount([suggestion()])).toBeNull()
    expect(similarSeedCount([])).toBeNull()
  })

  it('accepte que seule une partie des suggestions porte la valeur', () => {
    expect(similarSeedCount([suggestion(), suggestion({ seed_count: 2 })])).toBe(2)
  })
})

describe('shouldNameSeedBase', () => {
  it('parle SOUS le plancher', () => {
    expect(shouldNameSeedBase(1)).toBe(true)
    expect(shouldNameSeedBase(2)).toBe(true)
  })

  it('se tait AU plancher — une mention permanente cesse d’être lue', () => {
    expect(shouldNameSeedBase(SIMILAR_SEED_FLOOR)).toBe(false)
    expect(shouldNameSeedBase(SIMILAR_SEED_FLOOR + 1)).toBe(false)
  })

  it('se tait quand on ne sait pas', () => {
    expect(shouldNameSeedBase(null)).toBe(false)
    expect(shouldNameSeedBase(0)).toBe(false)
  })

  it('le plancher est celui du contrat, jamais recopié', () => {
    expect(SIMILAR_SEED_FLOOR).toBe(3)
  })
})
