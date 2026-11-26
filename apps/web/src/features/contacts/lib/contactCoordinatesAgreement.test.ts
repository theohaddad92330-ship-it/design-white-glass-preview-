import { contactCoordinates } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildBulkPreflight } from './bulkEmail'
import { classifyEnrichmentOutcome } from './enrichmentOutcomeStatus'

/**
 * #3698.7 — liste, fiche et préparation de message voient le MÊME résultat
 * d'enrichissement : trois consommateurs, un prédicat. Ce test rejoue les
 * mêmes lignes à travers chacun et exige le même verdict.
 */
const ROWS = [
  { label: 'e-mail seul', email: 'a@b.fr', phone: null, outcome: 'matched_email', addressable: true },
  { label: 'complet', email: 'a@b.fr', phone: '+33 6 00 00 00 00', outcome: 'matched_both', addressable: true },
  { label: 'téléphone seul', email: null, phone: '+33 6 00 00 00 00', outcome: 'matched_phone', addressable: false },
  { label: 'e-mail blanc', email: '  ', phone: null, outcome: 'no_result', addressable: false },
] as const

describe('contactCoordinates — accord liste / fiche / préparation (#3698.7)', () => {
  it.each(ROWS)('$label : même verdict partout', row => {
    const preflight = buildBulkPreflight([{ id: 'c1', full_name: 'X', email: row.email }])
    expect(preflight.recipients.length === 1).toBe(row.addressable) // liste
    expect(classifyEnrichmentOutcome({ email: row.email, phone: row.phone })).toBe(row.outcome) // fiche / résultat
    expect(contactCoordinates(row).can_prepare_email).toBe(row.addressable) // préparation
  })

  it('un e-mail seul n’est jamais classé en échec', () => {
    expect(classifyEnrichmentOutcome({ email: 'a@b.fr', phone: null })).not.toBe('technical_error')
    expect(classifyEnrichmentOutcome({ email: 'a@b.fr', phone: null })).not.toBe('no_result')
  })
})
