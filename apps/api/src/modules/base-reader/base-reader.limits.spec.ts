import {
  BASE_READER_DEFAULT_LIMIT,
  BASE_READER_FAMILY_ORDER,
  BASE_READER_MAX_LIMIT,
  BASE_READER_MAX_OFFSET,
  clampBaseReaderLimit,
  clampBaseReaderOffset,
} from './base-reader.limits'

/**
 * #4792 — les deux plafonds du lecteur commun vivent à UN endroit (GA-26), et ils savent dire NON :
 * une limite absurde est RAMENÉE, jamais acceptée, et jamais ramenée à zéro (une page vide se lirait
 * « rien trouvé » là où la base porte des milliers de lignes).
 */
describe('#4792 — les bornes du lecteur commun', () => {
  it('rend le défaut quand rien, ou rien de lisible, n’est demandé', () => {
    expect(clampBaseReaderLimit(undefined)).toBe(BASE_READER_DEFAULT_LIMIT)
    expect(clampBaseReaderLimit(null)).toBe(BASE_READER_DEFAULT_LIMIT)
    expect(clampBaseReaderLimit(Number.NaN)).toBe(BASE_READER_DEFAULT_LIMIT)
    // 0 et négatif ne rendent JAMAIS une page de zéro ligne : ils retombent sur le défaut.
    expect(clampBaseReaderLimit(0)).toBe(BASE_READER_DEFAULT_LIMIT)
    expect(clampBaseReaderLimit(-5)).toBe(BASE_READER_DEFAULT_LIMIT)
  })

  it('plafonne au plafond dur, et respecte une demande qui tient dedans', () => {
    expect(clampBaseReaderLimit(10_000)).toBe(BASE_READER_MAX_LIMIT)
    expect(clampBaseReaderLimit(BASE_READER_MAX_LIMIT)).toBe(BASE_READER_MAX_LIMIT)
    expect(clampBaseReaderLimit(25)).toBe(25)
    expect(clampBaseReaderLimit(25.9)).toBe(25)
  })

  it('le défaut reste SOUS le plafond dur — un défaut au plafond rendrait la pagination inatteignable', () => {
    expect(BASE_READER_DEFAULT_LIMIT).toBeLessThan(BASE_READER_MAX_LIMIT)
  })

  it('l’offset permet de dépasser 500 lignes sans réécrire la requête, et reste borné', () => {
    expect(clampBaseReaderOffset(600)).toBe(600)
    expect(clampBaseReaderOffset(undefined)).toBe(0)
    expect(clampBaseReaderOffset(-1)).toBe(0)
    expect(clampBaseReaderOffset(BASE_READER_MAX_OFFSET + 1)).toBe(BASE_READER_MAX_OFFSET)
    // La promesse chiffrée du lot : la 501e ligne est atteignable par pagination.
    expect(BASE_READER_MAX_OFFSET).toBeGreaterThan(500)
  })

  it('les trois familles sont nommées une fois, dans l’ordre de restitution', () => {
    expect([...BASE_READER_FAMILY_ORDER]).toEqual(['accounts', 'needs', 'consultants'])
    expect(new Set(BASE_READER_FAMILY_ORDER).size).toBe(BASE_READER_FAMILY_ORDER.length)
  })
})
