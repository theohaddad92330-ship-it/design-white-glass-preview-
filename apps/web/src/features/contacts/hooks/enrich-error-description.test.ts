import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api'
import { enrichErrorDescription } from './useEnrichContact'

/**
 * What the seller actually reads when « Enrichir » fails.
 *
 * The reported bug: every failure — a rejected Apollo key, an exhausted quota,
 * a provider outage — produced the same two English words, « API error », in a
 * French UI. That is not a diagnosis; it is the absence of one.
 *
 * The test that matters here is the DISTINCTION: these failures have different
 * repairs, so they must not render alike.
 */
describe('enrichErrorDescription', () => {
  const err = (code: string): ApiError => new ApiError('server sentence', 502, code)

  it('renders a different sentence for each provider failure', () => {
    const codes = [
      'missing_api_key',
      'unauthorized',
      'quota_exceeded',
      'rate_limited',
      'network_error',
      'upstream_error',
    ]
    const sentences = codes.map(c => enrichErrorDescription(err(c)))

    // All distinct — the property that was violated when everything said "API error".
    expect(new Set(sentences).size).toBe(codes.length)
    // None is a raw code, none is the old placeholder, none is empty.
    for (const s of sentences) {
      expect(s).not.toBe('API error')
      expect(s.length).toBeGreaterThan(20)
      expect(s).not.toMatch(/^[a-z_]+$/)
    }
  })

  it('tells the user a credential problem is not their fault', () => {
    // « Contacte le support » vs « Réessaie plus tard » is the actionable split:
    // a rejected key will never fix itself by retrying.
    expect(enrichErrorDescription(err('unauthorized'))).toMatch(/support/i)
    expect(enrichErrorDescription(err('upstream_error'))).toMatch(/réessaie/i)
  })

  it('never mentions credits, on every branch (#4463)', () => {
    // The product shows no credit anywhere: a failed action just says what to do next.
    for (const c of [
      'missing_api_key',
      'unauthorized',
      'quota_exceeded',
      'rate_limited',
      'network_error',
      'upstream_error',
    ]) {
      expect(enrichErrorDescription(err(c))).not.toMatch(/cr[ée]dit/i)
    }
  })

  it('never renders an untranslated key', () => {
    // A missing i18n entry makes i18next echo the key back — which would be the
    // same class of bug in a new costume.
    for (const c of [
      'missing_api_key',
      'unauthorized',
      'quota_exceeded',
      'rate_limited',
      'network_error',
      'upstream_error',
    ]) {
      expect(enrichErrorDescription(err(c))).not.toContain('contacts:enrich.error')
    }
  })

  it('falls back to the server message when no code is supplied', () => {
    expect(enrichErrorDescription(new ApiError('Le fournisseur a refusé.', 502))).toBe('Le fournisseur a refusé.')
  })

  it('has a localized last resort for a bare error', () => {
    const out = enrichErrorDescription(new Error(''))
    expect(out).toBe(i18n.t('contacts:enrich.error.unknown'))
    expect(out).not.toBe('API error')
  })

  it('keeps « rien trouvé » out of this path entirely', () => {
    // A genuine miss is a SUCCESS carrying matched=false, handled by onSuccess —
    // it must never travel through the error description. Asserting the wording
    // differs guards the outage/absence split at the last mile.
    const outage = enrichErrorDescription(err('upstream_error'))
    expect(outage).not.toBe(i18n.t('contacts:enrich.notFound'))
    expect(outage).not.toMatch(/aucune personne trouvée/i)
  })
})

describe("#3400 — un refus 402 ne dit « épuisés » que si le solde l'est", () => {
  it("la fin d'essai a son propre libellé, sans « épuisés »", () => {
    expect(i18n.t('contacts:enrich.trialEnded')).toMatch(/essai/i)
    expect(i18n.t('contacts:enrich.trialEnded')).not.toMatch(/épuisés/i)
    expect(i18n.t('contacts:enrich.trialEndedDescription')).not.toMatch(/cr[ée]dit/i)
  })

  it("l'indisponibilité ne parle d'aucun crédit et ne nomme pas le fournisseur", () => {
    const s = enrichErrorDescription(new ApiError('x', 502, 'upstream_error'))
    expect(s).toMatch(/momentanément indisponible/i)
    expect(s).not.toMatch(/cr[ée]dit/i)
    expect(s).not.toMatch(/apollo|fournisseur/i)
  })
})
