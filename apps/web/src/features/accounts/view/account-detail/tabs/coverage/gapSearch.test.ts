import { describe, expect, it } from 'vitest'
import type { CoverageGap } from '@bellum/contracts'
import { gapSearchQuery } from './gapSearch'

function gap(overrides: Partial<CoverageGap> = {}): CoverageGap {
  return {
    family: 'it',
    family_label: 'IT / DSI',
    level: 'c_level',
    level_label: 'C-Level (sponsor)',
    label: 'IT / DSI — DSI / CIO (C-Level)',
    suggested_titles: 'DSI / CIO',
    reason: 'Aucun sponsor exécutif.',
    priority: 1,
    ...overrides,
  }
}

describe('gapSearchQuery', () => {
  it('takes the first suggested title so the contacts search actually matches', () => {
    // `suggested_titles` is a human "A / B" string — searching it verbatim never
    // matches a real `contact.title`; the first token is the discriminating one.
    expect(gapSearchQuery(gap())).toBe('DSI')
    expect(gapSearchQuery(gap({ suggested_titles: 'RSSI / Directeur Cybersécurité' }))).toBe('RSSI')
    expect(gapSearchQuery(gap({ suggested_titles: 'Head of Data / Directeur Data' }))).toBe('Head of Data')
  })

  it('trims whitespace around the extracted title', () => {
    expect(gapSearchQuery(gap({ suggested_titles: '  Directeur Achats IT  / Vendor Manager' }))).toBe(
      'Directeur Achats IT',
    )
  })

  it('falls back to the family label when no title is suggested', () => {
    expect(gapSearchQuery(gap({ suggested_titles: '', family_label: 'Cyber / Sécurité' }))).toBe('Cyber')
    expect(gapSearchQuery(gap({ suggested_titles: '   ', family_label: 'Data' }))).toBe('Data')
  })

  it('never returns a slash-joined string (would match nothing)', () => {
    expect(gapSearchQuery(gap({ suggested_titles: 'Chief AI Officer' }))).toBe('Chief AI Officer')
    expect(gapSearchQuery(gap({ suggested_titles: 'A / B / C' }))).toBe('A')
  })
})
