import { UNROUTED_INTENT_CATEGORIES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { libelleCategorie, libelleSurface, phraseRetenus, valeurTraces } from './unrouted-intents.logic'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : l'écran des demandes que Laura n'a
 * pas su router. La lecture est déjà agrégée et plancher appliqué côté API ;
 * ces faits purs ne décident que de ce que l'écran DIT, en FR et en EN.
 */

describe('#1949.23 — libelleCategorie', () => {
  it('chaque catégorie du contrat a un libellé, dans les deux langues', () => {
    for (const category of UNROUTED_INTENT_CATEGORIES) {
      expect(libelleCategorie(category, 'fr')).not.toBe(category)
      expect(libelleCategorie(category, 'en')).not.toBe(category)
    }
    expect(libelleCategorie('hors_perimetre', 'fr')).toBe('Hors périmètre')
    expect(libelleCategorie('hors_perimetre', 'en')).toBe('Out of scope')
  })

  it('une catégorie inconnue se montre telle quelle, jamais un libellé inventé', () => {
    expect(libelleCategorie('meteo', 'fr')).toBe('meteo')
  })
})

describe('#1949.23 — libelleSurface', () => {
  it('nomme la NATURE de l’écran, dans les deux langues', () => {
    expect(libelleSurface('chat', 'fr')).toBe('Laura (plein écran)')
    expect(libelleSurface('account', 'en')).toBe('Account page')
  })

  it('une surface inconnue se montre telle quelle', () => {
    expect(libelleSurface('nouvel_ecran', 'fr')).toBe('nouvel_ecran')
  })
})

describe('#1949.23 — valeurTraces : « non mesuré » n’est jamais « 0 »', () => {
  it('un compte illisible rend un tiret', () => {
    expect(valeurTraces(null)).toBe('—')
  })

  it('un zéro MESURÉ se montre zéro', () => {
    expect(valeurTraces(0)).toBe('0')
    expect(valeurTraces(12)).toBe('12')
  })
})

describe('#1949.23 — phraseRetenus : le plancher est DIT, jamais tu', () => {
  it('aucune demande retenue → aucune phrase', () => {
    expect(phraseRetenus(0, 5, 'fr')).toBeNull()
  })

  it('nomme le compte et le plancher, et dit que le texte n’est pas affiché', () => {
    expect(phraseRetenus(1, 5, 'fr')).toBe(
      '1 demande pas encore assez répétée (moins de 5 occurrences distinctes) : son texte n’est pas affiché.',
    )
    expect(phraseRetenus(3, 5, 'fr')).toBe(
      '3 demandes pas encore assez répétées (moins de 5 occurrences distinctes) : leur texte n’est pas affiché.',
    )
    expect(phraseRetenus(3, 5, 'en')).toBe(
      '3 requests not repeated enough yet (fewer than 5 distinct occurrences): their text is not shown.',
    )
  })
})
