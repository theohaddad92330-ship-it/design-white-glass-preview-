import { describe, expect, it } from 'vitest'
import { setBetProfileSchema } from './account.js'

describe('#3245 setBetProfileSchema', () => {
  it('accepte un sous-ensemble de champs et null pour retirer', () => {
    expect(setBetProfileSchema.safeParse({ horizon: 'long', size: null }).success).toBe(true)
  })
  it('refuse une requête vide, une valeur hors vocabulaire et une ressource trop longue', () => {
    expect(setBetProfileSchema.safeParse({}).success).toBe(false)
    expect(setBetProfileSchema.safeParse({ horizon: 'medium' }).success).toBe(false)
    expect(setBetProfileSchema.safeParse({ resource: 'x'.repeat(61) }).success).toBe(false)
  })
})
