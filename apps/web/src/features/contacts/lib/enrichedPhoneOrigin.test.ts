import { describe, expect, it } from 'vitest'
import { enrichedPhoneOriginDate } from './contactProvenance'

/** #3822 / J1b.5 — la source d'un numéro trouvé se dit « Enrichissement » + date, jamais le fournisseur. */
describe('enrichedPhoneOriginDate', () => {
  const base = { phone: '+33 6 12 34 56 78', source: 'apollo', last_enrichment_at: '2026-10-07T10:00:00.000Z' }

  it('rend la date de l enrichissement quand le numéro vient d un fournisseur', () => {
    expect(enrichedPhoneOriginDate(base)).toBe('2026-10-07T10:00:00.000Z')
  })

  it('rien pour un numéro saisi à la main ou sans date d enrichissement', () => {
    expect(enrichedPhoneOriginDate({ ...base, source: 'manual' })).toBeNull()
    expect(enrichedPhoneOriginDate({ ...base, last_enrichment_at: null })).toBeNull()
  })

  it('rien quand la valeur n est pas un numéro enregistré', () => {
    expect(enrichedPhoneOriginDate({ ...base, phone: 'Disponible dans Apollo' })).toBeNull()
    expect(enrichedPhoneOriginDate({ ...base, phone: null })).toBeNull()
  })

  it('un fournisseur de secours compte aussi (jamais nommé)', () => {
    expect(enrichedPhoneOriginDate({ ...base, source: 'fullenrich' })).toBe(base.last_enrichment_at)
    expect(enrichedPhoneOriginDate({ ...base, source: 'salesql' })).toBe(base.last_enrichment_at)
  })
})
