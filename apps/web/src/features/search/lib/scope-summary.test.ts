import { describe, expect, it } from 'vitest'
import type { CompanySuggestion } from '@bellum/contracts'
import { buildScopeSummary } from './scope-summary'

const entity = (over: Partial<CompanySuggestion> = {}): CompanySuggestion =>
  ({ name: 'TF1 SA', siren: '326300159', city: 'Boulogne-Billancourt', sector: 'Médias', ...over }) as CompanySuggestion

describe('buildScopeSummary (P0-02)', () => {
  it('anchors on a precise entity when the locked suggestion still matches the typed name', () => {
    const s = buildScopeSummary({ query: 'TF1 SA', scopedEntity: entity(), scopeMode: 'groupe' })
    expect(s.isEntityLocked).toBe(true)
    expect(s.objectName).toBe('TF1 SA')
    expect(s.registryLabel).toBe('SIREN 326300159')
    expect(s.location).toBe('Boulogne-Billancourt · Médias')
    expect(s.scopeMode).toBe('groupe')
  })

  it('falls back to name resolution when the typed name diverges from the locked entity', () => {
    // Edited the field after locking → the anchor no longer applies (SG → SCI risk).
    const s = buildScopeSummary({ query: 'TF1 Groupe', scopedEntity: entity(), scopeMode: 'france' })
    expect(s.isEntityLocked).toBe(false)
    expect(s.objectName).toBe('TF1 Groupe')
    expect(s.registryLabel).toBeNull()
    expect(s.location).toBeNull()
  })

  it('prefers a foreign registry id + label over a SIREN', () => {
    const s = buildScopeSummary({
      query: 'Apple Inc.',
      scopedEntity: entity({ name: 'Apple Inc.', siren: undefined, registryId: '320193', registryIdLabel: 'CIK' }),
      scopeMode: 'groupe',
    })
    expect(s.registryLabel).toBe('CIK 320193')
  })

  it('trims the name and treats no locked entity as name resolution', () => {
    const s = buildScopeSummary({ query: '  Doctolib  ', scopedEntity: null, scopeMode: 'custom' })
    expect(s.objectName).toBe('Doctolib')
    expect(s.isEntityLocked).toBe(false)
    expect(s.registryLabel).toBeNull()
  })
})
