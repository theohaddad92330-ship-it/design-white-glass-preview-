import { normalizeRegistryRef } from './registry-id.util'

describe('normalizeRegistryRef', () => {
  describe('US — SEC CIK (zero-padded 10 digits)', () => {
    it.each([
      ['1467373', '0001467373'],
      ['0001467373', '0001467373'],
      ['CIK 1467373', '0001467373'],
      ['cik:1467373', '0001467373'],
    ])('canonicalises %s → %s', (raw, expected) => {
      expect(normalizeRegistryRef('US', raw)).toEqual({ country: 'US', id: expected })
    })

    it.each(['12345678901', 'EPAM', '', '  '])('refuses a non-CIK value (%s)', raw => {
      expect(normalizeRegistryRef('US', raw)).toBeNull()
    })
  })

  describe('CH — UID (CHE + 9 digits, no dots/dashes)', () => {
    it.each([
      ['CHE-105.944.452', 'CHE105944452'],
      ['CHE105944452', 'CHE105944452'],
      ['che 105 944 452', 'CHE105944452'],
      // Bare 9-digit UID gains the CHE prefix.
      ['105944452', 'CHE105944452'],
    ])('canonicalises %s → %s', (raw, expected) => {
      expect(normalizeRegistryRef('CH', raw)).toEqual({ country: 'CH', id: expected })
    })

    it.each(['CHE-105.944', 'FR105944452', '10594445', ''])('refuses a malformed UID (%s)', raw => {
      expect(normalizeRegistryRef('CH', raw)).toBeNull()
    })
  })

  describe('BE — BCE/KBO enterprise number (10 digits)', () => {
    it.each([
      ['0202.239.951', '0202239951'],
      ['0202239951', '0202239951'],
      // Legacy 9-digit form gains the leading zero.
      ['202239951', '0202239951'],
      ['BE 0202 239 951', null], // country prefix is not part of the number
    ])('canonicalises %s → %s', (raw, expected) => {
      expect(normalizeRegistryRef('BE', raw)).toEqual(expected ? { country: 'BE', id: expected } : null)
    })

    it('refuses an establishment-unit number (2xxx)', () => {
      expect(normalizeRegistryRef('BE', '2123456789')).toBeNull()
    })
  })

  describe('CA — corporation number (separator-stripped, uppercased)', () => {
    it.each([
      ['18052956', '18052956'],
      ['bc-1234567', 'BC1234567'],
    ])('canonicalises %s → %s', (raw, expected) => {
      expect(normalizeRegistryRef('CA', raw)).toEqual({ country: 'CA', id: expected })
    })

    it('refuses a value with non-alphanumeric residue', () => {
      expect(normalizeRegistryRef('CA', '18052956!')).toBeNull()
    })
  })

  describe('LU — RCS (section letter + digits)', () => {
    it.each([
      ['B19669', 'B19669'],
      ['b 19669', 'B19669'],
      ['B-19669', 'B19669'],
    ])('canonicalises %s → %s', (raw, expected) => {
      expect(normalizeRegistryRef('LU', raw)).toEqual({ country: 'LU', id: expected })
    })

    it('refuses a digits-only RCS (the section letter is never guessed)', () => {
      expect(normalizeRegistryRef('LU', '19669')).toBeNull()
    })
  })

  describe('guards', () => {
    it('refuses FR — the French pivot stays the siren column (path unchanged)', () => {
      expect(normalizeRegistryRef('FR', '552120222')).toBeNull()
    })

    it.each([
      [undefined, '0001467373'],
      ['', '0001467373'],
      ['USA', '0001467373'], // 3 letters — not an ISO-ish 2-letter code
      ['U1', '0001467373'],
      ['US', undefined],
      ['US', ''],
    ])('refuses a missing/malformed half (country=%s, id=%s)', (country, id) => {
      expect(normalizeRegistryRef(country, id)).toBeNull()
    })

    it('canonicalises an unknown (future-pack) country generically', () => {
      expect(normalizeRegistryRef('de', 'hrb 12.345')).toEqual({ country: 'DE', id: 'HRB12345' })
      expect(normalizeRegistryRef('DE', '§§§')).toBeNull()
    })
  })
})
