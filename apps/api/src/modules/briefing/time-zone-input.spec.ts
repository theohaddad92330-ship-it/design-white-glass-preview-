import { DEFAULT_TIME_ZONE, isValidTimeZone, resolveTimeZone } from './time-zone-input'

/**
 * LE FUSEAU DU CLIENT, JAMAIS DEVINÉ (#1936, lot 7A).
 *
 * `resolveTimeZone` est le point de passage unique entre « ce que le
 * navigateur envoie » et « le fuseau que le serveur utilise ». Un fuseau
 * absent, vide ou qui n'est pas un identifiant IANA retombe SILENCIEUSEMENT
 * sur {@link DEFAULT_TIME_ZONE} — jamais une exception, jamais un fuseau
 * deviné à partir d'un texte qu'on ne sait pas lire.
 */
describe('isValidTimeZone', () => {
  it('reconnaît un identifiant IANA valide', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Pacific/Auckland')).toBe(true)
  })

  it('rejette un texte qui n’est pas un identifiant IANA', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('GMT+2')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('   ')).toBe(false)
  })
})

describe('resolveTimeZone', () => {
  it('rend le fuseau du client quand il est un IANA valide', () => {
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York')
  })

  it('retombe sur le fuseau par défaut quand le client n’en envoie aucun', () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE)
  })

  it('retombe sur le fuseau par défaut plutôt que de deviner un texte illisible', () => {
    // ⚠️ Le point du test : un fuseau invalide ne lève JAMAIS — deviner ou
    // faire échouer la requête pour ça serait pire que le repli.
    expect(resolveTimeZone('Not/AZone')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('<script>')).toBe(DEFAULT_TIME_ZONE)
  })
})
