import { formatNavBadgeCount } from './nav-badge'

/**
 * #2155.24/.25 — ces deux règles ont chacune leur test qui SAIT DIRE NON : un
 * badge qui afficherait `0` casserait « une valeur absente ne s'affiche
 * jamais 0 », un badge qui afficherait `147` casserait « pas de badge à trois
 * chiffres en permanence ». Les deux sont vérifiées séparément pour qu'une
 * régression sur l'une ne se cache pas derrière l'autre.
 */
describe('formatNavBadgeCount', () => {
  it('ne rend rien pour une mesure absente — jamais un 0 qui prétendrait avoir compté', () => {
    expect(formatNavBadgeCount(undefined)).toBeUndefined()
  })

  it('ne rend rien pour une population vide — même contrat que l’absence de mesure', () => {
    expect(formatNavBadgeCount(0)).toBeUndefined()
  })

  it('rend le nombre exact sous la centaine', () => {
    expect(formatNavBadgeCount(1)).toBe('1')
    expect(formatNavBadgeCount(42)).toBe('42')
    expect(formatNavBadgeCount(99)).toBe('99')
  })

  it('plafonne à 99+ dès trois chiffres — jamais un nombre à trois chiffres en permanence', () => {
    expect(formatNavBadgeCount(100)).toBe('99+')
    expect(formatNavBadgeCount(147)).toBe('99+')
  })

  it('sait dire NON : un nombre à trois chiffres écrit en clair ferait échouer ce test', () => {
    // Témoin direct de la règle #2155.25 — si `formatNavBadgeCount` se
    // contentait de `String(count)`, cette assertion romprait.
    expect(formatNavBadgeCount(342)).not.toBe('342')
  })
})
