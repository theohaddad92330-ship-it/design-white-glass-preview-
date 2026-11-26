import { isEnrichmentCountryAllowed, resolveAllowedEnrichmentCountries } from './enrichment-country-gate'

describe('resolveAllowedEnrichmentCountries — #2297.16', () => {
  it('absente ou vide = pas de garde (no-op strict, doctrine CLAUDE.md)', () => {
    expect(resolveAllowedEnrichmentCountries(undefined)).toBeNull()
    expect(resolveAllowedEnrichmentCountries('')).toBeNull()
    expect(resolveAllowedEnrichmentCountries('   ')).toBeNull()
  })

  it('une seule virgule ou des virgules vides ne posent pas non plus de garde', () => {
    expect(resolveAllowedEnrichmentCountries(',')).toBeNull()
    expect(resolveAllowedEnrichmentCountries(' , , ')).toBeNull()
  })

  it('découpe, normalise en MAJUSCULES et retire les espaces', () => {
    expect(resolveAllowedEnrichmentCountries('fr, be ,CH')).toEqual(['FR', 'BE', 'CH'])
  })

  it('ignore les segments vides sans casser le reste de la liste', () => {
    expect(resolveAllowedEnrichmentCountries('FR,,BE,')).toEqual(['FR', 'BE'])
  })
})

describe('isEnrichmentCountryAllowed — #2297.16', () => {
  it('garde absente (null) = toujours vrai, quel que soit le pays', () => {
    expect(isEnrichmentCountryAllowed('FR', null)).toBe(true)
    expect(isEnrichmentCountryAllowed(null, null)).toBe(true)
    expect(isEnrichmentCountryAllowed(undefined, null)).toBe(true)
    expect(isEnrichmentCountryAllowed('XX', null)).toBe(true)
  })

  it('garde posée : un pays couvert passe, insensible à la casse', () => {
    expect(isEnrichmentCountryAllowed('FR', ['FR', 'BE'])).toBe(true)
    expect(isEnrichmentCountryAllowed('fr', ['FR', 'BE'])).toBe(true)
  })

  it('garde posée : un pays non couvert est refusé', () => {
    expect(isEnrichmentCountryAllowed('DE', ['FR', 'BE'])).toBe(false)
  })

  it('garde posée : un pays non vérifié (absent/vide) est refusé — « vérifié » et « compatible » sont la même question', () => {
    expect(isEnrichmentCountryAllowed(null, ['FR'])).toBe(false)
    expect(isEnrichmentCountryAllowed(undefined, ['FR'])).toBe(false)
    expect(isEnrichmentCountryAllowed('', ['FR'])).toBe(false)
    expect(isEnrichmentCountryAllowed('   ', ['FR'])).toBe(false)
  })
})
