import { describe, expect, it } from 'vitest'
import { FAVORITE_ENTITY_TYPES, favoriteEntityTypeSchema } from './favorites.js'

/**
 * #1800 (09/09/2026) — la capacité « favori » est retirée ; ce contrat ne garde
 * que ce qui a encore un lecteur : la contrainte SQL `user_favorites_entity_type_check`
 * (toujours en base — « on archive, on ne supprime pas ») et la colonne
 * `entity_type` de `UserFavoriteEntity`. Voir `favorites.ts` et
 * `user-favorite.entity.ts` pour le récit complet.
 */
describe('favoris — ce qui reste : l’énumération de la contrainte SQL', () => {
  it('porte encore les trois types couverts par `user_favorites_entity_type_check`', () => {
    expect(FAVORITE_ENTITY_TYPES).toEqual(['contact', 'account', 'talent'])
  })

  it('refuse un type d’objet que la contrainte SQL ne couvre pas', () => {
    expect(favoriteEntityTypeSchema.safeParse('mission').success).toBe(false)
  })

  it('accepte les trois valeurs couvertes par la migration `1790973000002`', () => {
    for (const type of FAVORITE_ENTITY_TYPES) {
      expect(favoriteEntityTypeSchema.safeParse(type).success).toBe(true)
    }
  })
})
