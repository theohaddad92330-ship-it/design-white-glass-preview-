import { describe, expect, it } from 'vitest'
import { bulkEnrichmentSummaryOf } from './enrichSummary'

/**
 * #2297.48 — le récapitulatif chiffré du lot, par CHAMP plutôt qu'un seul
 * compteur « trouvé ». L'exemple exact de l'issue (#2297) :
 * « 38 emails trouvés / 17 mobiles trouvés / 9 identités à confirmer /
 * 6 sans résultat / 0 envoyé ». « Mobile » n'étant pas modélisé séparément
 * du téléphone professionnel (#2297.8, absent), ce module compte le
 * TÉLÉPHONE trouvé — jamais un champ plus précis que ce qu'on a vraiment.
 */
describe('bulkEnrichmentSummaryOf — #2297.48', () => {
  it('compte les emails et les téléphones trouvés séparément', () => {
    const summary = bulkEnrichmentSummaryOf(
      [
        { email: 'a@b.com', phone: '0600000000', last_enrichment_result: 'matched' },
        { email: 'c@d.com', phone: null, last_enrichment_result: 'matched' },
        { email: null, phone: '0600000001', last_enrichment_result: 'matched' },
      ],
      0,
    )
    expect(summary.emailsFound).toBe(2)
    expect(summary.phonesFound).toBe(2)
  })

  it('compte une identité ambiguë à part — jamais comme « sans résultat »', () => {
    const summary = bulkEnrichmentSummaryOf([{ email: null, phone: null, last_enrichment_result: 'ambiguous' }], 0)
    expect(summary.identitiesToConfirm).toBe(1)
    expect(summary.withoutResult).toBe(0)
  })

  it('compte « sans résultat » un contact sans email ni téléphone et non ambigu', () => {
    const summary = bulkEnrichmentSummaryOf([{ email: null, phone: null, last_enrichment_result: 'no_new_data' }], 0)
    expect(summary.withoutResult).toBe(1)
    expect(summary.identitiesToConfirm).toBe(0)
  })

  it('reporte les échecs tels que comptés par l’appelant (exceptions catchées)', () => {
    const summary = bulkEnrichmentSummaryOf([], 3)
    expect(summary.failed).toBe(3)
  })

  it('reproduit l’exemple exact de l’issue #2297', () => {
    const outcomes = [
      ...Array.from({ length: 38 }, () => ({ email: 'a@b.com', phone: null, last_enrichment_result: 'matched' })),
      ...Array.from({ length: 17 }, () => ({ email: null, phone: '0600000000', last_enrichment_result: 'matched' })),
      ...Array.from({ length: 9 }, () => ({ email: null, phone: null, last_enrichment_result: 'ambiguous' })),
      ...Array.from({ length: 6 }, () => ({ email: null, phone: null, last_enrichment_result: 'no_new_data' })),
    ]
    const summary = bulkEnrichmentSummaryOf(outcomes, 0)
    expect(summary).toEqual({ emailsFound: 38, phonesFound: 17, identitiesToConfirm: 9, withoutResult: 6, failed: 0 })
  })
})
