import { describe, expect, it } from 'vitest'
import { settledEnrichmentToOutcome, summarizeBulkEnrichmentOutcomes } from './bulkEnrichmentSummary'

describe('summarizeBulkEnrichmentOutcomes', () => {
  it('#2297 (LOT) — compte les emails et les mobiles trouvés indépendamment (un contact peut compter dans les deux)', () => {
    const summary = summarizeBulkEnrichmentOutcomes([
      { status: 'matched', email: true, phone: true },
      { status: 'matched', email: true, phone: false },
      { status: 'matched', email: false, phone: true },
    ])
    expect(summary).toEqual({ emailsFound: 2, mobilesFound: 2, toConfirm: 0, noResult: 0, sent: 0 })
  })

  it('range une identité ambiguë sous « à confirmer », jamais sous « sans résultat »', () => {
    const summary = summarizeBulkEnrichmentOutcomes([{ status: 'ambiguous' }, { status: 'ambiguous' }])
    expect(summary).toEqual({ emailsFound: 0, mobilesFound: 0, toConfirm: 2, noResult: 0, sent: 0 })
  })

  it('range un résultat matché sans aucune coordonnée sous « sans résultat »', () => {
    const summary = summarizeBulkEnrichmentOutcomes([{ status: 'matched', email: false, phone: false }])
    expect(summary).toEqual({ emailsFound: 0, mobilesFound: 0, toConfirm: 0, noResult: 1, sent: 0 })
  })

  it('range un échec (introuvable, refusé, panne fournisseur…) sous « sans résultat »', () => {
    const summary = summarizeBulkEnrichmentOutcomes([{ status: 'no_result' }, { status: 'no_result' }])
    expect(summary).toEqual({ emailsFound: 0, mobilesFound: 0, toConfirm: 0, noResult: 2, sent: 0 })
  })

  it('`sent` reste toujours 0 — Laura prépare, ne débite ni n’envoie jamais depuis cette vérification', () => {
    const summary = summarizeBulkEnrichmentOutcomes([{ status: 'matched', email: true, phone: true }])
    expect(summary.sent).toBe(0)
  })

  it('un lot vide reste un lot à zéro partout, jamais une valeur absente', () => {
    expect(summarizeBulkEnrichmentOutcomes([])).toEqual({
      emailsFound: 0,
      mobilesFound: 0,
      toConfirm: 0,
      noResult: 0,
      sent: 0,
    })
  })
})

describe('settledEnrichmentToOutcome', () => {
  it('un résultat réussi avec une coordonnée devient `matched`', () => {
    const outcome = settledEnrichmentToOutcome({
      status: 'fulfilled',
      value: { email: 'a@b.fr', phone: null, last_enrichment_result: 'matched' } as never,
    })
    expect(outcome).toEqual({ status: 'matched', email: true, phone: false })
  })

  it('#2297.18 — un résultat `ambiguous` devient `ambiguous`, jamais compté comme `matched` sans coordonnée', () => {
    const outcome = settledEnrichmentToOutcome({
      status: 'fulfilled',
      value: { email: null, phone: null, last_enrichment_result: 'ambiguous' } as never,
    })
    expect(outcome).toEqual({ status: 'ambiguous' })
  })

  it('une promesse rejetée (introuvable, refusé, panne fournisseur…) devient `no_result`', () => {
    const outcome = settledEnrichmentToOutcome({ status: 'rejected', reason: new Error('boom') })
    expect(outcome).toEqual({ status: 'no_result' })
  })
})
